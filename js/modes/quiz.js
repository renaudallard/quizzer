/* Quiz: multiple choice, true or false and written answers over one set. The
   answer is only written to the store when the learner moves on, so the "I had
   it" override cannot double count a card. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, sample, pct } from '../util.js';
import { grade, normalize } from '../text.js';
import {
  studyShell, answerField, feedbackBanner, summaryPanel,
  saveSession, bindKeys, speakButton, cardText,
} from '../study.js';
import { notFoundPanel } from '../views/shared.js';

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

function distractors(pool, card, forward, answer) {
  const target = normalize(answer);
  const seen = new Set([target]);
  const out = [];
  for (const other of pool) {
    if (other.id === card.id) continue;
    const text = forward ? other.def : other.term;
    const key = normalize(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function buildQuestions(set, source, config) {
  return shuffle(source).slice(0, config.count).map((card) => {
    const kind = config.types[Math.floor(Math.random() * config.types.length)];
    const forward = config.direction === 'mixed'
      ? Math.random() < 0.5
      : config.direction === 'forward';

    const question = {
      card,
      kind,
      prompt: forward ? card.term : card.def,
      answer: forward ? card.def : card.term,
      promptLang: forward ? set.termLang : set.defLang,
      answerLang: forward ? set.defLang : set.termLang,
      hint: card.hint,
    };

    const others = distractors(set.cards, card, forward, question.answer);
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
      scoreLabel: t('quiz.resultBody', { correct, total }),
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
      const isAnswer = normalize(option) === normalize(question.answer);
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
    if (run.pending) {
      return el('div', { class: 'answer-form' },
        el('input', {
          type: 'text', class: 'input', readonly: true,
          value: run.pending.detail.typed || '', 'aria-label': t('write.answerPlaceholder'),
        }));
    }
    const settings = store.getSettings();
    const field = answerField({
      placeholder: t('write.answerPlaceholder'),
      submitLabel: t('quiz.check'),
      onSubmit: (value) => {
        const verdict = grade(value, question.answer, settings);
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
    let feedback = null;
    if (pending) {
      const verdict = pending.correct
        ? (pending.detail.verdict && pending.detail.verdict.verdict === 'almost' ? 'almost' : 'correct')
        : 'wrong';
      feedback = el('div', {},
        feedbackBanner(verdict, {
          expected: verdict === 'correct' ? null : question.answer,
          accent: Boolean(pending.detail.verdict && pending.detail.verdict.accent),
          lang: question.answerLang,
        }),
        el('div', { class: 'study-nav', style: { marginTop: '18px' } },
          !pending.correct && question.kind === 'written'
            ? el('button', { type: 'button', class: 'btn', onclick: override }, icon('check'), t('quiz.override'))
            : null,
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: advance },
            t('common.continue'), icon('right'))));
    }

    mount(stage, promptPanel(question), body, feedback);

    if (pending) {
      const next = stage.querySelector('.study-nav .btn-primary');
      if (next) next.focus();
    }
  }

  bindKeys((event) => {
    if (!run || run.index >= run.questions.length) return;
    if (run.pending) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); }
      return;
    }
    const question = run.questions[run.index];
    const slot = Number(event.key);
    if (!Number.isInteger(slot) || slot < 1) return;
    if (question.kind === 'choice' && slot <= question.options.length) {
      stage.querySelectorAll('.option')[slot - 1].click();
    } else if (question.kind === 'truefalse' && slot <= 2) {
      stage.querySelectorAll('.option')[slot - 1].click();
    }
  });

  showSetup();
  return shell.root;
}
