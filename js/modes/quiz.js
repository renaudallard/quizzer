/* Quiz: multiple choice, true or false and written answers over one set. The
   answer is only written to the store when the learner moves on, so the "I had
   it" override cannot double count a card. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, sample, pct } from '../util.js';
import { gradeAny, textKey } from '../text.js';
import {
  studyShell, answerField, answerFeedback, typedAnswer, summaryPanel,
  saveSession, bindKeys, speakButton, cardText,
} from '../study.js';
import { notFoundPanel } from '../views/shared.js';
import { setBusy } from '../router.js';

const COUNTS = [5, 10, 20, 50];
const TYPES = [
  { id: 'choice', label: 'quiz.typeChoice' },
  { id: 'truefalse', label: 'quiz.typeTrueFalse' },
  { id: 'written', label: 'quiz.typeWritten' },
];
const ASK_KEYS = { choice: 'quiz.askChoice', truefalse: 'quiz.askTrueFalse', written: 'quiz.askWritten' };
const DIRECTIONS = [
  { id: 'forward', label: 'quiz.dirForward' },
  { id: 'backward', label: 'quiz.dirBackward' },
  { id: 'mixed', label: 'quiz.dirMixed' },
];

/* Both sides of every card, normalised once per build rather than once per
   card for every question. */
function indexCards(cards) {
  return cards.map((card) => ({ card, term: textKey(card.term), def: textKey(card.def) }));
}

/* A prompt can belong to several cards, such as two words that both mean
   "bonjour": the answer of each of them is right, so none of them may be
   offered as a wrong option, and a typed answer may be any of them. */
function sidesOf(entry, forward) {
  return forward
    ? { prompt: entry.term, key: entry.def, text: entry.card.def }
    : { prompt: entry.def, key: entry.term, text: entry.card.term };
}

function buildQuestions(set, source, config) {
  const index = indexCards(set.cards);
  const byId = new Map(index.map((entry) => [entry.card.id, entry]));

  return shuffle(source).slice(0, config.count).map((card) => {
    const kind = config.types[Math.floor(Math.random() * config.types.length)];
    const forward = config.direction === 'mixed'
      ? Math.random() < 0.5
      : config.direction === 'forward';
    const own = sidesOf(byId.get(card.id) || indexCards([card])[0], forward);

    const question = {
      card,
      kind,
      prompt: forward ? card.term : card.def,
      answer: own.text,
      accepted: [own.text],
      promptLang: forward ? set.termLang : set.defLang,
      answerLang: forward ? set.defLang : set.termLang,
      hint: card.hint,
    };

    const taken = new Set([own.key]);
    const others = [];
    for (const entry of index) {
      if (entry.card.id === card.id) continue;
      const sides = sidesOf(entry, forward);
      if (sides.prompt === own.prompt) {
        question.accepted.push(sides.text);
        taken.add(sides.key);
      }
    }
    if (kind !== 'written') {
      for (const entry of index) {
        const sides = sidesOf(entry, forward);
        if (!sides.key || taken.has(sides.key)) continue;
        taken.add(sides.key);
        others.push(sides.text);
      }
    }

    if (kind === 'choice') {
      question.options = shuffle([question.answer, ...sample(others, 3)]);
    } else if (kind === 'truefalse') {
      const truthful = !others.length || Math.random() < 0.5;
      question.shown = truthful ? question.answer : sample(others, 1)[0];
      question.truth = truthful;
    }
    return question;
  });
}

export function quizView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.quiz' });
  const stage = el('div');
  shell.body.appendChild(stage);

  const config = {
    count: Math.min(20, set.cards.length),
    types: ['choice', 'truefalse', 'written'],
    direction: 'forward',
  };
  let run = null;
  setBusy(() => run !== null);

  function showSetup() {
    shell.setProgress(0, 0);

    const counts = COUNTS.filter((value) => value < set.cards.length).concat(set.cards.length);
    const countSelect = el('select', { class: 'select' },
      counts.map((value) => el('option', { value: String(value) }, tn('count.questions', value))));
    countSelect.value = String(config.count);

    const typeBoxes = TYPES.map((type) => {
      const box = el('input', { type: 'checkbox', checked: config.types.includes(type.id) });
      box.dataset.id = type.id;
      return el('label', { class: 'checkbox' }, box, el('span', { class: 'checkbox-text' }, t(type.label)));
    });

    const directionSelect = el('select', { class: 'select' },
      DIRECTIONS.map((entry) => el('option', { value: entry.id }, t(entry.label))));
    directionSelect.value = config.direction;

    const start = el('button', { type: 'button', class: 'btn btn-primary btn-lg' }, t('quiz.start'));
    const warning = el('p', { class: 'field-hint', hidden: true }, t('quiz.needType'));

    start.addEventListener('click', () => {
      const chosen = typeBoxes
        .map((label) => label.querySelector('input'))
        .filter((box) => box.checked)
        .map((box) => box.dataset.id);
      if (!chosen.length) {
        warning.hidden = false;
        return;
      }
      config.count = Number(countSelect.value);
      config.types = chosen;
      config.direction = directionSelect.value;
      beginRun(buildQuestions(set, set.cards, config));
    });

    mount(stage, el('div', { class: 'panel stack' },
      el('h2', {}, t('quiz.setupTitle')),
      el('label', { class: 'field' }, el('span', {}, t('quiz.count')), countSelect),
      el('fieldset', { class: 'field', style: { border: 'none', padding: '0', margin: '0' } },
        el('legend', { class: 'field-label' }, t('quiz.types')),
        el('div', { class: 'stack', style: { gap: '8px', marginTop: '6px' } }, typeBoxes)),
      el('label', { class: 'field' }, el('span', {}, t('quiz.direction')), directionSelect),
      warning,
      el('div', { class: 'row' }, start)));
  }

  function beginRun(questions) {
    run = { questions, index: 0, correct: 0, missed: [], pending: null, startedAt: Date.now() };
    paint();
  }

  /* Holds the verdict until the learner moves on, which is also when it reaches
     the store. */
  function answer(correct, detail) {
    if (!run || run.pending) return;
    run.pending = { correct, detail: detail || {} };
    paint();
  }

  function override() {
    if (!run || !run.pending) return;
    run.pending.correct = true;
    paint();
  }

  function advance() {
    if (!run || !run.pending) return;
    const question = run.questions[run.index];
    store.recordAnswer(set.id, question.card.id, run.pending.correct);
    if (run.pending.correct) run.correct += 1;
    else run.missed.push(question.card);
    run.pending = null;
    run.index += 1;
    paint();
  }

  function finish() {
    const { correct, questions, missed, startedAt } = run;
    const total = questions.length;
    shell.setProgress(total, total);
    saveSession(set.id, { mode: 'quiz', total, correct, ms: Date.now() - startedAt });
    const again = missed.slice();
    run = null;

    mount(stage, summaryPanel({
      score: formatPercent(pct(correct, total)),
      scoreLabel: tn('quiz.resultBody', correct, { total }),
      title: t('quiz.resultTitle'),
      actions: [
        again.length
          ? el('button', {
              type: 'button', class: 'btn btn-primary',
              onclick: () => beginRun(buildQuestions(set, again, { ...config, count: again.length })),
            }, icon('restart'), t('quiz.retryMissed'))
          : null,
        el('button', { type: 'button', class: 'btn', onclick: showSetup }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
      ].filter(Boolean),
      missed: again,
      langs: set,
    }));
  }

  function promptPanel(question) {
    return el('div', { class: 'question' },
      el('p', { class: 'question-kind' }, t(ASK_KEYS[question.kind])),
      el('div', { class: 'question-prompt' },
        cardText(question.prompt, question.promptLang),
        speakButton(question.prompt, question.promptLang),
        question.kind === 'truefalse'
          ? el('span', { class: 'hint' }, '→ ', cardText(question.shown, question.answerLang))
          : null,
        question.hint && question.kind !== 'truefalse'
          ? el('span', { class: 'hint' }, question.hint)
          : null));
  }

  function choiceBody(question) {
    const pending = run.pending;
    const buttons = question.options.map((option, i) => {
      const isAnswer = textKey(option) === textKey(question.answer);
      let state = null;
      if (pending) {
        if (isAnswer) state = 'correct';
        else if (pending.detail.picked === option) state = 'wrong';
      }
      return el('button', {
        type: 'button', class: 'option', disabled: Boolean(pending),
        dataset: state ? { state } : {},
        onclick: () => answer(isAnswer, { picked: option }),
      }, el('span', { class: 'key' }, String(i + 1)), cardText(option, question.answerLang));
    });
    return el('div', { class: 'options' }, buttons);
  }

  function trueFalseBody(question) {
    const pending = run.pending;
    const make = (value, label, key) => {
      const isRight = value === question.truth;
      let state = null;
      if (pending) {
        if (isRight) state = 'correct';
        else if (pending.detail.picked === value) state = 'wrong';
      }
      return el('button', {
        type: 'button', class: 'option', disabled: Boolean(pending),
        dataset: state ? { state } : {},
        onclick: () => answer(isRight, { picked: value }),
      }, el('span', { class: 'key' }, key), label);
    };
    return el('div', { class: 'options' },
      make(true, t('quiz.true'), '1'),
      make(false, t('quiz.false'), '2'));
  }

  function writtenBody(question) {
    if (run.pending) return typedAnswer(run.pending.detail.typed || '');
    const settings = store.getSettings();
    const field = answerField({
      placeholder: t('write.answerPlaceholder'),
      submitLabel: t('quiz.check'),
      onSubmit: (value) => {
        const verdict = gradeAny(value, question.accepted, settings);
        answer(verdict.verdict !== 'wrong', { typed: value, verdict });
      },
    });
    return field.root;
  }

  function paint() {
    if (run.index >= run.questions.length) {
      finish();
      return;
    }
    const question = run.questions[run.index];
    shell.setProgress(run.index + (run.pending ? 1 : 0), run.questions.length);

    const body = question.kind === 'choice' ? choiceBody(question)
      : question.kind === 'truefalse' ? trueFalseBody(question)
        : writtenBody(question);

    const pending = run.pending;
    const feedback = pending
      ? answerFeedback({
          correct: pending.correct,
          result: pending.detail.verdict,
          expected: question.answer,
          lang: question.answerLang,
          onOverride: question.kind === 'written' ? override : null,
          onContinue: advance,
        })
      : null;

    mount(stage, promptPanel(question), body, feedback);
  }

  bindKeys((event) => {
    if (!run || run.index >= run.questions.length) return;
    if (run.pending) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); }
      return;
    }
    const slot = Number(event.key);
    if (!Number.isInteger(slot) || slot < 1) return;
    /* Written questions have no options, so the lookup finds nothing there. */
    const option = stage.querySelectorAll('.option')[slot - 1];
    if (option) option.click();
  });

  showSetup();
  return shell.root;
}
