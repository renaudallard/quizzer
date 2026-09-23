/* Learn: every card is first picked out among options, then written from
   memory, the least known cards first and a few at a time. A miss sends the
   card back to the options and brings it round again soon, so the round ends
   once every card has been written right. */

import { el, icon, mount } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle } from '../util.js';
import { studyShell, summaryPanel, saveSession, askable } from '../study.js';
import { indexCards, buildQuestion, questionAsker, directionField, goesForward } from '../question.js';
import { notFoundPanel } from '../views/shared.js';

/* The steps a card climbs, easiest first. */
const STEPS = ['choice', 'written'];
/* Cards worked on at once: enough that a card does not come straight back,
   few enough that it comes back while still fresh. */
const IN_PLAY = 7;
/* Other questions asked before a missed card comes back. */
const RETRY_GAP = 2;

/* The least known first: the lowest box, then the larger share of misses.
   Cards that tie come in random order. */
function leastKnownFirst(cards) {
  const missRate = (card) => (card.seen ? card.lapses / card.seen : 0);
  return shuffle(cards).sort((a, b) => (a.box - b.box) || (missRate(b) - missRate(a)));
}

export function learnView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.learn' });
  const stage = el('div');
  shell.body.appendChild(stage);

  let direction = 'forward';
  let run = null;

  const asker = questionAsker(stage, {
    onContinue: (question, correct) => {
      const card = question.card;
      store.recordAnswer(set.id, card.id, correct);
      run.asked += 1;
      if (correct) {
        const step = (run.steps.get(card.id) || 0) + 1;
        run.steps.set(card.id, step);
        if (step >= STEPS.length) run.learned += 1;
        else run.inPlay.push(card);
      } else {
        run.mistakes += 1;
        run.missed.add(card.id);
        run.steps.set(card.id, 0);
        run.inPlay.splice(RETRY_GAP, 0, card);
      }
      run.last = card.id;
      next();
    },
  });

  function showSetup() {
    shell.setProgress(0, 0);
    const field = directionField(direction);
    mount(stage, el('div', { class: 'panel stack' },
      el('h2', {}, t('learn.setupTitle')),
      el('p', {}, t('learn.setupBody')),
      field.root,
      el('div', { class: 'row' },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-lg',
          onclick: () => { direction = field.value; begin(); },
        }, t('quiz.start')))));
  }

  function begin() {
    const cards = leastKnownFirst(set.cards.filter(askable));
    run = {
      index: indexCards(set.cards), waiting: cards, inPlay: [], steps: new Map(), missed: new Set(),
      total: cards.length, learned: 0, asked: 0, mistakes: 0, last: null, startedAt: Date.now(),
    };
    next();
  }

  function next() {
    while (run.inPlay.length < IN_PLAY && run.waiting.length) run.inPlay.push(run.waiting.shift());
    if (!run.inPlay.length) {
      finish();
      return;
    }
    /* The card just asked waits its turn, unless no other is left. */
    const at = run.inPlay.length > 1 && run.inPlay[0].id === run.last ? 1 : 0;
    const card = run.inPlay.splice(at, 1)[0];
    const kind = STEPS[run.steps.get(card.id) || 0];
    shell.setProgress(run.learned, run.total);
    asker.ask(buildQuestion(set, run.index, card, kind, goesForward(direction)), {
      after: el('p', { class: 'flashcard-foot', style: { textAlign: 'center', marginTop: '14px' } },
        tn('learn.remaining', run.total - run.learned)),
    });
  }

  /* Every card is learned by the end, so the score is how many never
     slipped, as in write. */
  function finish() {
    const { total, missed, asked, mistakes, startedAt } = run;
    const clean = total - missed.size;
    shell.setProgress(total, total);
    saveSession(set.id, { mode: 'learn', total, correct: clean, ms: Date.now() - startedAt });
    run = null;
    mount(stage, summaryPanel({
      score: clean + '/' + total,
      scoreLabel: t('learn.doneBody', {
        questions: tn('count.questions', asked),
        mistakes: tn('write.doneMistakes', mistakes),
      }),
      title: t('learn.doneTitle'),
      actions: [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: showSetup }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
        el('a', { class: 'btn', href: '#/set/' + set.id + '/stats' }, icon('chart'), t('mode.stats')),
      ],
    }));
  }

  showSetup();
  return shell.root;
}
