/* Quiz: multiple choice, true or false and written answers over one set,
   against the clock if the learner wants. The answer is only written to the
   store when the learner moves on, so the "I had it" override cannot double
   count a card. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, pct } from '../util.js';
import { studyShell, summaryPanel, saveSession, askable, timerField, countdown } from '../study.js';
import {
  indexCards, buildQuestion, questionAsker, directionField, goesForward, typesField,
} from '../question.js';
import { notFoundPanel } from '../views/shared.js';

const COUNTS = [5, 10, 20, 50];
const TYPES = ['choice', 'truefalse', 'written'];

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
    minutes: 0,
  };
  let run = null;

  const asker = questionAsker(stage, {
    onAnswer: () => shell.setProgress(run.index + 1, run.questions.length),
    onContinue: (question, correct) => {
      settle(question, correct);
      next();
    },
  });

  /* An answer made final: into the store and the score. */
  function settle(question, correct) {
    store.recordAnswer(set.id, question.card.id, correct);
    if (correct) run.correct += 1;
    else run.missed.push(question.card);
    run.index += 1;
  }

  function showSetup() {
    shell.setProgress(0, 0);

    const available = set.cards.filter(askable).length;
    const counts = COUNTS.filter((value) => value < available).concat(available);
    const countSelect = el('select', { class: 'select' },
      counts.map((value) => el('option', { value: String(value) }, tn('count.questions', value))));
    countSelect.value = String(config.count);

    const types = typesField(TYPES, config.types);
    const direction = directionField(config.direction);
    const timer = timerField(config.minutes);

    const start = el('button', { type: 'button', class: 'btn btn-primary btn-lg' }, t('quiz.start'));
    const warning = el('p', { class: 'field-hint', hidden: true }, t('quiz.needType'));

    start.addEventListener('click', () => {
      const chosen = types.value;
      if (!chosen.length) {
        warning.hidden = false;
        return;
      }
      config.count = Number(countSelect.value);
      config.types = chosen;
      config.direction = direction.value;
      config.minutes = timer.value;
      beginRun(buildQuestions(set, set.cards, config));
    });

    mount(stage, el('div', { class: 'panel stack' },
      el('h2', {}, t('quiz.setupTitle')),
      el('label', { class: 'field' }, el('span', {}, t('quiz.count')), countSelect),
      types.root,
      direction.root,
      timer.root,
      warning,
      el('div', { class: 'row' }, start)));
  }

  function beginRun(questions) {
    run = {
      questions, index: 0, correct: 0, missed: [], startedAt: Date.now(),
      clock: config.minutes ? countdown(config.minutes, timeUp) : null,
    };
    next();
  }

  /* An answer already given counts; the questions never reached are missed,
     but leave the schedule alone since they were not tried. */
  function timeUp() {
    const given = asker.stop();
    if (given) settle(given.question, given.correct);
    const unanswered = run.questions.slice(run.index).map((question) => question.card);
    run.missed.push(...unanswered);
    finish(unanswered.length);
  }

  function next() {
    if (run.index >= run.questions.length) {
      finish();
      return;
    }
    shell.setProgress(run.index, run.questions.length);
    asker.ask(run.questions[run.index], { before: run.clock && run.clock.node });
  }

  /* unanswered is only given when the time ran out, which the result says. */
  function finish(unanswered) {
    const { correct, questions, missed, startedAt, clock } = run;
    if (clock) clock.stop();
    const total = questions.length;
    const timedOut = unanswered !== undefined;
    shell.setProgress(total, total);
    saveSession(set.id, { mode: 'quiz', total, correct, ms: Date.now() - startedAt });
    const again = missed.slice();
    run = null;

    mount(stage, summaryPanel({
      score: formatPercent(pct(correct, total)),
      scoreLabel: tn('quiz.resultBody', correct, { total }),
      title: t(timedOut ? 'quiz.timeUp' : 'quiz.resultTitle'),
      body: unanswered ? tn('quiz.unanswered', unanswered) : null,
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
