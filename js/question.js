/* Questions as the quiz and learn modes ask them: one card as multiple
   choice, true or false or a written answer, and the widget that puts one on
   screen and collects the verdict. */

import { el, mount } from './dom.js';
import { t } from './i18n/index.js';
import { getSettings } from './store.js';
import { shuffle, sample } from './util.js';
import { gradeAny, textKey } from './text.js';
import {
  answerField, answerFeedback, typedAnswer, bindKeys, speakButton, cardText, cardSide, sideKey,
} from './study.js';

const ASK_KEYS = { choice: 'quiz.askChoice', truefalse: 'quiz.askTrueFalse', written: 'quiz.askWritten' };
const DIRECTIONS = [
  { id: 'forward', label: 'quiz.dirForward' },
  { id: 'backward', label: 'quiz.dirBackward' },
  { id: 'mixed', label: 'quiz.dirMixed' },
];

/* The direction choice of a setup panel. */
export function directionField(value) {
  const select = el('select', { class: 'select' },
    DIRECTIONS.map((entry) => el('option', { value: entry.id }, t(entry.label))));
  select.value = value;
  return {
    root: el('label', { class: 'field' }, el('span', {}, t('quiz.direction')), select),
    get value() { return select.value; },
  };
}

/* Whether a question goes from term to definition; a mixed direction draws
   it anew for every question. */
export function goesForward(direction) {
  return direction === 'mixed' ? Math.random() < 0.5 : direction === 'forward';
}

/* Both sides of every card, normalised once per round rather than once per
   card for every question. */
export function indexCards(cards) {
  return cards.map((card) => ({
    card, term: sideKey(card.term, card.termImage), def: sideKey(card.def, card.defImage),
  }));
}

/* A prompt can belong to several cards, such as two words that both mean
   "bonjour": the answer of each of them is right, so none of them may be
   offered as a wrong option, and a typed answer may be any of them. */
function sidesOf(entry, forward) {
  return forward
    ? { prompt: entry.term, key: entry.def, text: entry.card.def }
    : { prompt: entry.def, key: entry.term, text: entry.card.term };
}

/* One card asked as kind, "choice", "truefalse" or "written". index is what
   indexCards() made of the whole set, whose other cards give the wrong
   options and the answers that share the prompt. */
export function buildQuestion(set, index, card, kind, forward) {
  /* A side that is only a picture cannot be typed or listed as an option:
     the question then goes the other way. */
  if (!(forward ? card.def : card.term)) forward = !forward;
  const own = sidesOf(index.find((entry) => entry.card.id === card.id) || indexCards([card])[0], forward);

  const question = {
    card,
    kind,
    prompt: forward ? card.term : card.def,
    promptImage: forward ? card.termImage : card.defImage,
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
      if (sides.text) question.accepted.push(sides.text);
      taken.add(sides.key);
    }
  }
  if (kind !== 'written') {
    for (const entry of index) {
      const sides = sidesOf(entry, forward);
      if (!sides.text || taken.has(sides.key)) continue;
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
}

/* Puts one question at a time on stage. The verdict is held until the
   learner moves on, and only then handed to onContinue, so the "I had it"
   override cannot count a card twice. onAnswer hears of the answer at once,
   for a progress bar that should move with it. */
export function questionAsker(stage, { onAnswer, onContinue }) {
  let question = null;
  let pending = null;
  let around = {};

  function answer(correct, detail) {
    if (!question || pending) return;
    pending = { correct, detail: detail || {} };
    if (onAnswer) onAnswer(question);
    paint();
  }

  function override() {
    if (!pending) return;
    pending.correct = true;
    paint();
  }

  function advance() {
    if (!pending) return;
    const done = question;
    const { correct } = pending;
    question = null;
    pending = null;
    onContinue(done, correct);
  }

  function promptPanel() {
    return el('div', { class: 'question' },
      el('p', { class: 'question-kind' }, t(ASK_KEYS[question.kind])),
      el('div', { class: 'question-prompt' },
        cardSide(question.prompt, question.promptImage, question.promptLang),
        question.prompt ? speakButton(question.prompt, question.promptLang) : null,
        question.kind === 'truefalse'
          ? el('span', { class: 'hint' }, '→ ', cardText(question.shown, question.answerLang))
          : null,
        question.hint && question.kind !== 'truefalse'
          ? el('span', { class: 'hint' }, question.hint)
          : null));
  }

  function choiceBody() {
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

  function trueFalseBody() {
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

  function writtenBody() {
    if (pending) return typedAnswer(pending.detail.typed || '');
    const settings = getSettings();
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
    const body = question.kind === 'choice' ? choiceBody()
      : question.kind === 'truefalse' ? trueFalseBody()
        : writtenBody();

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

    mount(stage, around.before, promptPanel(), body, feedback, around.after);
  }

  bindKeys((event) => {
    if (!question) return;
    if (pending) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); }
      return;
    }
    const slot = Number(event.key);
    if (!Number.isInteger(slot) || slot < 1) return;
    /* Written questions have no options, so the lookup finds nothing there. */
    const option = stage.querySelectorAll('.option')[slot - 1];
    if (option) option.click();
  });

  return {
    /* before and after are nodes kept above and below the question. */
    ask(next, { before = null, after = null } = {}) {
      question = next;
      pending = null;
      around = { before, after };
      paint();
    },
    /* Takes the question off the stage. An answer already given is handed
       back, since it was made and should count. */
    stop() {
      const left = pending ? { question, correct: pending.correct } : null;
      question = null;
      pending = null;
      return left;
    },
  };
}
