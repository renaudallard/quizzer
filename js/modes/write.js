/* Write: type the answer for every card. A card you miss returns later in the
   round, so the round ends only once the whole set has been produced from
   memory at least once. */

import { el, icon, mount } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle } from '../util.js';
import { gradeAny, maskAnswer, normalize } from '../text.js';
import {
  studyShell, answerField, answerFeedback, typedAnswer, summaryPanel,
  saveSession, bindKeys, speakButton, cardText,
} from '../study.js';
import { notFoundPanel } from '../views/shared.js';
import { setBusy } from '../router.js';

export function writeView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.write' });
  const stage = el('div');
  shell.body.appendChild(stage);

  let run = null;
  setBusy(() => Boolean(run && (run.position > 0 || run.pending)));

  function begin() {
    run = {
      queue: shuffle(set.cards.slice()),
      position: 0,
      cleared: 0,
      mistakes: 0,
      hinted: false,
      pending: null,
      total: set.cards.length,
      startedAt: Date.now(),
    };
    paint();
  }

  function submit(value) {
    if (!run || run.pending) return;
    const card = run.queue[run.position];
    /* Another card with the same term has a definition that is just as right. */
    const term = normalize(card.term);
    const accepted = set.cards.filter((other) => other.id === card.id || normalize(other.term) === term)
      .map((other) => other.def);
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
      run.queue.push(card);
    }
    run.pending = null;
    run.hinted = false;
    run.position += 1;
    paint();
  }

  function finish() {
    const { total, mistakes, cleared, startedAt } = run;
    shell.setProgress(total, total);
    saveSession(set.id, { mode: 'write', total, correct: cleared, ms: Date.now() - startedAt });
    run = null;
    mount(stage, summaryPanel({
      score: total + '/' + total,
      scoreLabel: t('write.doneBody', { total, mistakes }),
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
    const remaining = run.queue.length - run.position;
    shell.setProgress(run.cleared, run.cleared + remaining);

    const prompt = el('div', { class: 'question' },
      el('p', { class: 'question-kind' }, t('write.prompt')),
      el('div', { class: 'question-prompt' },
        cardText(card.term, set.termLang),
        speakButton(card.term, set.termLang),
        card.hint ? el('span', { class: 'hint' }, card.hint) : null,
        run.hinted ? el('span', { class: 'hint' }, maskAnswer(card.def)) : null));

    let body;
    let feedback = null;

    if (run.pending) {
      body = typedAnswer(run.pending.typed);
      feedback = answerFeedback({
        correct: run.pending.correct,
        result: run.pending.verdict,
        expected: card.def,
        lang: set.defLang,
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
      body = el('div', {},
        field.root,
        el('div', { class: 'study-toolbar', style: { marginTop: '12px' } },
          el('button', {
            type: 'button', class: 'btn toggle-btn', disabled: run.hinted,
            onclick: () => { run.hinted = true; paint(); },
          }, icon('eye'), t('write.hint')),
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
