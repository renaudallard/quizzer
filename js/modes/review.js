/* Spaced review: only the cards the schedule says are ripe, graded by the
   learner. A miss sends the card back to the first box and to the end of the
   queue, so it comes round again before the session ends. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatRelativeDays } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, nextDueInDays } from '../srs.js';
import { shuffle } from '../util.js';
import { studyShell, flipCard, summaryPanel, saveSession, bindKeys } from '../study.js';
import { notFoundPanel } from '../views/shared.js';
import { setBusy } from '../router.js';

const CATCH_UP = 20;

export function reviewView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.review' });
  const stage = el('div');
  /* Turning the card by hand, click or key, reveals the answer the same way
     the button does, so the grades always come with it. */
  const card = flipCard({ onFlip: (flipped) => { if (flipped && run && !run.revealed) reveal(); } });
  shell.body.appendChild(stage);

  /* Null until a session starts, so the key handler knows to stay out of it. */
  let run = null;
  setBusy(() => Boolean(run && (run.position > 0 || run.revealed)));

  function showEmpty() {
    shell.setProgress(0, 0);
    const oldest = set.cards.slice().sort((a, b) => (a.due || 0) - (b.due || 0)).slice(0, CATCH_UP);
    mount(stage, el('div', { class: 'empty' },
      el('h2', {}, t('review.emptyTitle')),
      el('p', {}, t('review.emptyBody')),
      el('div', { class: 'empty-actions' },
        el('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => start(shuffle(oldest)),
        }, icon('repeat'), t('review.anyway')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')))));
  }

  function start(queue) {
    run = {
      queue, position: 0, cleared: 0, firstTry: 0,
      total: queue.length, seen: new Set(), revealed: false, startedAt: Date.now(),
    };
    paint();
  }

  function reveal() {
    if (!run || run.revealed || run.position >= run.queue.length) return;
    run.revealed = true;
    card.flip(true);
    paint();
  }

  function grade(correct) {
    if (!run || !run.revealed) return;
    const entry = run.queue[run.position];
    if (!run.seen.has(entry.id)) {
      run.seen.add(entry.id);
      if (correct) run.firstTry += 1;
    }
    store.recordAnswer(set.id, entry.id, correct);
    if (correct) run.cleared += 1;
    else run.queue.push(entry);
    run.position += 1;
    run.revealed = false;
    paint();
  }

  function finish() {
    shell.setProgress(1, 1);
    saveSession(set.id, {
      mode: 'review', total: run.total, correct: run.firstTry, ms: Date.now() - run.startedAt,
    });
    const { firstTry, total } = run;
    run = null;
    mount(stage, summaryPanel({
      score: firstTry + '/' + total,
      scoreLabel: tn('review.doneBody', firstTry, { total }),
      title: t('review.doneTitle'),
      actions: [
        el('a', { class: 'btn btn-primary', href: '#/set/' + set.id }, t('common.back')),
        el('a', { class: 'btn', href: '#/set/' + set.id + '/stats' }, icon('chart'), t('mode.stats')),
      ],
    }));
  }

  function paint() {
    if (run.position >= run.queue.length) {
      finish();
      return;
    }

    const entry = run.queue[run.position];
    const remaining = run.queue.length - run.position;
    shell.setProgress(run.cleared, run.cleared + remaining);

    card.setFaces(
      { label: t('common.term'), text: entry.term, lang: set.termLang, hint: entry.hint },
      { label: t('common.definition'), text: entry.def, lang: set.defLang });
    if (run.revealed) card.flip(true);

    const actions = run.revealed
      ? [
          el('button', { type: 'button', class: 'btn btn-lg', onclick: () => grade(false) },
            icon('restart'), t('review.again')),
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => grade(true) },
            icon('check'), t('review.good')),
        ]
      : [
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: reveal },
            icon('eye'), t('review.reveal')),
        ];

    mount(stage,
      card.root,
      el('div', { class: 'study-nav' }, actions),
      el('p', { class: 'flashcard-foot', style: { textAlign: 'center', marginTop: '14px' } },
        tn('review.remaining', remaining),
        entry.seen ? ' · ' + t('review.nextDue', { when: formatRelativeDays(nextDueInDays(entry)) }) : ''));
  }

  bindKeys((event) => {
    if (!run) return;
    if (!run.revealed && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      reveal();
    } else if (run.revealed && (event.key === '1' || event.key === 'j')) {
      grade(false);
    } else if (run.revealed && (event.key === '2' || event.key === 'k')) {
      grade(true);
    }
  });

  const due = shuffle(dueCards(set.cards));
  if (due.length) start(due);
  else showEmpty();

  return shell.root;
}
