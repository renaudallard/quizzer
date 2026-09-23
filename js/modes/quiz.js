/* Quiz: multiple choice, true or false and written answers over one set. The
   answer is only written to the store when the learner moves on, so the "I had
   it" override cannot double count a card. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, pct } from '../util.js';
import { studyShell, summaryPanel, saveSession, askable } from '../study.js';
import { indexCards, buildQuestion, questionAsker, directionField, goesForward } from '../question.js';
import { notFoundPanel } from '../views/shared.js';

const COUNTS = [5, 10, 20, 50];
const TYPES = [
  { id: 'choice', label: 'quiz.typeChoice' },
  { id: 'truefalse', label: 'quiz.typeTrueFalse' },
  { id: 'written', label: 'quiz.typeWritten' },
];

function buildQuestions(set, source, config) {
  const index = indexCards(set.cards);
  return shuffle(source.filter(askable)).slice(0, config.count).map((card) => buildQuestion(
    set, index, card,
    config.types[Math.floor(Math.random() * config.types.length)],
    goesForward(config.direction)));
}

export function quizView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.quiz' });
  const stage = el('div');
  shell.body.appendChild(stage);

  const config = {
    count: Math.min(20, set.cards.filter(askable).length),
    types: ['choice', 'truefalse', 'written'],
    direction: 'forward',
  };
  let run = null;

  const asker = questionAsker(stage, {
    onAnswer: () => shell.setProgress(run.index + 1, run.questions.length),
    onContinue: (question, correct) => {
      store.recordAnswer(set.id, question.card.id, correct);
      if (correct) run.correct += 1;
      else run.missed.push(question.card);
      run.index += 1;
      next();
    },
  });

  function showSetup() {
    shell.setProgress(0, 0);

    const available = set.cards.filter(askable).length;
    const counts = COUNTS.filter((value) => value < available).concat(available);
    const countSelect = el('select', { class: 'select' },
      counts.map((value) => el('option', { value: String(value) }, tn('count.questions', value))));
    countSelect.value = String(config.count);

    const typeBoxes = TYPES.map((type) => {
      const box = el('input', { type: 'checkbox', checked: config.types.includes(type.id) });
      box.dataset.id = type.id;
      return el('label', { class: 'checkbox' }, box, el('span', { class: 'checkbox-text' }, t(type.label)));
    });

    const direction = directionField(config.direction);

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
      config.direction = direction.value;
      beginRun(buildQuestions(set, set.cards, config));
    });

    mount(stage, el('div', { class: 'panel stack' },
      el('h2', {}, t('quiz.setupTitle')),
      el('label', { class: 'field' }, el('span', {}, t('quiz.count')), countSelect),
      el('fieldset', { class: 'field', style: { border: 'none', padding: '0', margin: '0' } },
        el('legend', { class: 'field-label' }, t('quiz.types')),
        el('div', { class: 'stack', style: { gap: '8px', marginTop: '6px' } }, typeBoxes)),
      direction.root,
      warning,
      el('div', { class: 'row' }, start)));
  }

  function beginRun(questions) {
    run = { questions, index: 0, correct: 0, missed: [], startedAt: Date.now() };
    next();
  }

  function next() {
    if (run.index >= run.questions.length) {
      finish();
      return;
    }
    shell.setProgress(run.index, run.questions.length);
    asker.ask(run.questions[run.index]);
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

  showSetup();
  return shell.root;
}
