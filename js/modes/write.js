/* Write: type the answer for every card. A card you miss returns later in the
   round, so the round ends only once the whole set has been produced from
   memory at least once. */

import { el, icon, mount } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle } from '../util.js';
import { gradeAny, maskAnswer } from '../text.js';
import {
  studyShell, answerField, answerFeedback, typedAnswer, summaryPanel,
  saveSession, bindKeys, speakButton, cardSide, sideKey, askable,
} from '../study.js';
import { notFoundPanel } from '../views/shared.js';

export function writeView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.write' });
  const stage = el('div');
  shell.body.appendChild(stage);

  let run = null;

  /* The definition is typed from the term, unless it is only a picture: the
     term is then typed from the picture. */
  function asked(card) {
    return card.def
      ? { text: card.term, image: card.termImage, lang: set.termLang, answer: card.def, answerLang: set.defLang }
      : { text: card.def, image: card.defImage, lang: set.defLang, answer: card.term, answerLang: set.termLang };
  }

  function begin() {
    const cards = set.cards.filter(askable);
    run = {
      queue: shuffle(cards),
      position: 0,
      cleared: 0,
      mistakes: 0,
      slipped: new Set(),
      hinted: false,
      pending: null,
      total: cards.length,
      startedAt: Date.now(),
    };
    paint();
  }

  function submit(value) {
    if (!run || run.pending) return;
    const card = run.queue[run.position];
    /* Another card showing the same prompt has an answer that is just as
       right. The card asked for goes first, so a miss shows its answer. */
    const side = asked(card);
    const prompt = sideKey(side.text, side.image);
    const accepted = [side.answer, ...set.cards
      .filter((other) => other.id !== card.id && askable(other))
      .map(asked)
      .filter((other) => sideKey(other.text, other.image) === prompt)
      .map((other) => other.answer)];
    const verdict = gradeAny(value, accepted, store.getSettings());
    run.pending = { verdict, typed: value, correct: verdict.verdict !== 'wrong' };
    paint();
  }

  function skip() {
    if (!run || run.pending) return;
    run.pending = { verdict: { verdict: 'wrong', accent: false }, typed: '', correct: false };
    paint();
  }

  function override() {
    if (!run || !run.pending) return;
    run.pending.correct = true;
    paint();
  }

  function advance() {
    if (!run || !run.pending) return;
    const card = run.queue[run.position];
    store.recordAnswer(set.id, card.id, run.pending.correct);
    if (run.pending.correct) {
      run.cleared += 1;
    } else {
      run.mistakes += 1;
      run.slipped.add(card.id);
      run.queue.push(card);
    }
    run.pending = null;
    run.hinted = false;
    run.position += 1;
    paint();
  }

  /* Every card is cleared by the end of a round, so the score is how many
     were right the first time, as in review. */
  function finish() {
    const { total, mistakes, slipped, startedAt } = run;
    const firstTry = total - slipped.size;
    shell.setProgress(total, total);
    saveSession(set.id, { mode: 'write', total, correct: firstTry, ms: Date.now() - startedAt });
    run = null;
    mount(stage, summaryPanel({
      score: firstTry + '/' + total,
      scoreLabel: t('write.doneBody', {
        cleared: tn('write.doneCleared', total),
        mistakes: tn('write.doneMistakes', mistakes),
      }),
      title: t('write.doneTitle'),
      actions: [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: begin }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
        el('a', { class: 'btn', href: '#/set/' + set.id + '/stats' }, icon('chart'), t('mode.stats')),
      ],
    }));
  }

  function paint() {
    if (run.position >= run.queue.length) {
      finish();
      return;
    }

    const card = run.queue[run.position];
    const side = asked(card);
    const remaining = run.queue.length - run.position;
    shell.setProgress(run.cleared, run.cleared + remaining);

    const line = el('div', { class: 'question-prompt' },
      cardSide(side.text, side.image, side.lang),
      side.text ? speakButton(side.text, side.lang) : null,
      card.hint ? el('span', { class: 'hint' }, card.hint) : null,
      run.hinted ? el('span', { class: 'hint' }, maskAnswer(side.answer)) : null);
    const prompt = el('div', { class: 'question' },
      el('p', { class: 'question-kind' }, t('write.prompt')),
      line);

    let body;
    let feedback = null;

    if (run.pending) {
      body = typedAnswer(run.pending.typed);
      feedback = answerFeedback({
        correct: run.pending.correct,
        result: run.pending.verdict,
        expected: side.answer,
        lang: side.answerLang,
        note: run.pending.correct ? null : t('write.requeued'),
        onOverride: override,
        onContinue: advance,
      });
    } else {
      const field = answerField({
        placeholder: t('write.answerPlaceholder'),
        submitLabel: t('quiz.check'),
        onSubmit: submit,
      });
      /* The hint is added in place, so what has been typed so far stays. */
      const hint = el('button', {
        type: 'button', class: 'btn toggle-btn', disabled: run.hinted,
        onclick: () => {
          run.hinted = true;
          line.appendChild(el('span', { class: 'hint' }, maskAnswer(side.answer)));
          hint.disabled = true;
          field.focus();
        },
      }, icon('eye'), t('write.hint'));
      body = el('div', {},
        field.root,
        el('div', { class: 'study-toolbar', style: { marginTop: '12px' } },
          hint,
          el('button', { type: 'button', class: 'btn toggle-btn', onclick: skip }, t('write.skip'))));
    }

    mount(stage, prompt, body, feedback,
      el('p', { class: 'flashcard-foot', style: { textAlign: 'center', marginTop: '14px' } },
        tn('write.remaining', remaining)));
  }

  bindKeys((event) => {
    if (!run || !run.pending) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      advance();
    }
  });

  begin();
  return shell.root;
}
