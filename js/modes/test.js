/* Test: every question on one page, true or false, multiple choice,
   matching and written, in that order, graded only once the learner hands
   the test in. Nothing is written to the store before then, so answers can
   change freely; a question left blank counts as missed. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, pct, clamp } from '../util.js';
import { gradeAny, textKey } from '../text.js';
import { richText } from '../math.js';
import {
  studyShell, summaryPanel, saveSession, askable, timerField, countdown,
  cardSide, cardText, typedAnswer, feedbackBanner, interpolateNode,
} from '../study.js';
import {
  indexCards, buildQuestion, directionField, goesForward, typesField,
  questionPrompt, optionButtons, rightOption, rightPair,
} from '../question.js';
import { notFoundPanel } from '../views/shared.js';

const TYPES = ['truefalse', 'choice', 'matching', 'written'];
/* A matching group holds five prompts at most, so it fits on a phone. */
const GROUP_MAX = 5;
/* The pick of a multiple choice question answered "don't know". */
const DONT_KNOW = {};

/* count questions shared out between the kinds, the first ones taking what
   does not divide evenly. A matching group of one would be a free point, so
   a lone matching question goes to another kind when there is one. */
function shares(count, kinds) {
  const out = kinds.map((kind, i) => ({
    kind, count: Math.floor(count / kinds.length) + (i < count % kinds.length ? 1 : 0),
  }));
  const matching = out.find((entry) => entry.kind === 'matching');
  if (matching && matching.count === 1 && out.length > 1) {
    matching.count = 0;
    out.find((entry) => entry !== matching).count += 1;
  }
  return out;
}

/* Cards cut into as few groups as GROUP_MAX allows, as even as can be:
   seven make four and three, never five and two, nor a group of one. */
function groups(cards) {
  const count = Math.ceil(cards.length / GROUP_MAX);
  const out = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const size = Math.floor(cards.length / count) + (i < cards.length % count ? 1 : 0);
    out.push(cards.slice(at, at += size));
  }
  return out;
}

/* The test as blocks, each of one question but for matching, whose block is
   a group of questions sharing one pool of answers. An answer keeps its own
   language, since a card whose answer side is only a picture is asked the
   other way. */
function buildTest(set, source, config) {
  const index = indexCards(set.cards);
  const cards = shuffle(source.filter(askable)).slice(0, config.count);
  const blocks = [];
  let at = 0;
  for (const { kind, count } of shares(cards.length, TYPES.filter((type) => config.types.includes(type)))) {
    const mine = cards.slice(at, at += count);
    if (kind === 'matching') {
      for (const group of groups(mine)) {
        const forward = goesForward(config.direction);
        const questions = group.map((card) => buildQuestion(set, index, card, kind, forward));
        const pool = questions.map((question) => ({ text: question.answer, lang: question.answerLang }));
        blocks.push({ kind, questions, pool: shuffle(pool) });
      }
    } else {
      for (const card of mine) {
        blocks.push({ kind, questions: [buildQuestion(set, index, card, kind, goesForward(config.direction))] });
      }
    }
  }
  return blocks;
}

/* Where a block sits in the test, as "3 of 11" or "7-8 of 11". */
function placeOf(block, questions) {
  const first = questions.indexOf(block.questions[0]) + 1;
  const last = first + block.questions.length - 1;
  const total = questions.length;
  return first === last
    ? t('progress.position', { current: first, total })
    : t('test.positionRange', { first, last, total });
}

function matchHead(place) {
  return el('div', { class: 'row-between' },
    el('p', { class: 'question-kind' }, t('test.askMatching')),
    el('span', { class: 'count' }, place));
}

function matchPrompt(question) {
  return el('div', { class: 'match-prompt' },
    cardSide(question.prompt, question.promptImage, question.promptLang),
    question.hint ? el('span', { class: 'hint' }, richText(question.hint)) : null);
}

function answered(question) {
  if (question.kind === 'written') return Boolean(question.given && question.given.trim());
  return question.given !== undefined;
}

/* The verdict on a question: right or not, and for a written answer what
   gradeAny() made of it, which tells "almost" and accents apart. */
function grade(question, settings) {
  if (!answered(question) || question.given === DONT_KNOW) return { correct: false };
  if (question.kind === 'written') {
    const result = gradeAny(question.given, question.accepted, { ...settings, lang: question.answerLang });
    return { correct: result.verdict !== 'wrong', result };
  }
  if (question.kind === 'matching') {
    const key = textKey(question.given);
    return { correct: question.accepted.some((answer) => textKey(answer) === key) };
  }
  return { correct: rightOption(question, question.given) };
}

export function testView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const shell = studyShell({ set, modeKey: 'mode.test' });
  const stage = el('div');
  shell.body.appendChild(stage);

  const available = set.cards.filter(askable).length;
  const config = {
    count: Math.min(20, available),
    types: TYPES.slice(),
    direction: 'forward',
    minutes: 0,
  };
  let run = null;

  function showSetup() {
    shell.setProgress(0, 0);

    const count = el('input', {
      type: 'number', class: 'input', min: '1', max: String(available), step: '1',
      value: String(config.count), inputmode: 'numeric',
    });
    const types = typesField(TYPES, config.types);
    const direction = directionField(config.direction);
    const timer = timerField(config.minutes);
    const warning = el('p', { class: 'field-hint', hidden: true }, t('quiz.needType'));

    const start = el('button', { type: 'button', class: 'btn btn-primary btn-lg' }, t('quiz.start'));
    start.addEventListener('click', () => {
      if (!types.value.length) {
        warning.hidden = false;
        return;
      }
      /* Anything that is not a number keeps the count as it was. */
      const wanted = Math.round(Number(count.value));
      if (count.value.trim() && Number.isFinite(wanted)) config.count = clamp(wanted, 1, available);
      config.types = types.value;
      config.direction = direction.value;
      config.minutes = timer.value;
      begin(set.cards);
    });

    mount(stage, el('div', { class: 'panel stack' },
      el('h2', {}, t('test.setupTitle')),
      el('label', { class: 'field' }, el('span', {}, t('test.count', { max: available })), count),
      types.root,
      direction.root,
      timer.root,
      warning,
      el('div', { class: 'row' }, start)));
  }

  function begin(source) {
    const blocks = buildTest(set, source, config);
    run = {
      blocks,
      questions: blocks.flatMap((block) => block.questions),
      startedAt: Date.now(),
      clock: config.minutes ? countdown(config.minutes, () => submit(true)) : null,
    };
    paint();
  }

  function progress() {
    shell.setProgress(run.questions.filter(answered).length, run.questions.length);
  }

  /* Enter in a written answer goes on to the next question. */
  function nextFocus(from) {
    const blocks = [...stage.querySelectorAll('.test-question')];
    const after = blocks[blocks.indexOf(from.closest('.test-question')) + 1];
    const target = after
      ? after.querySelector('input, button')
      : stage.querySelector('.test-submit');
    if (target) target.focus();
  }

  function optionsBlock(block, node) {
    const [question] = block.questions;
    const repaint = () => {
      mount(node, questionPrompt(question, placeOf(block, run.questions)),
        optionButtons(question, {
          picked: question.given,
          select: true,
          onPick: (value) => { question.given = value; repaint(); progress(); },
        }),
        question.kind === 'choice'
          ? el('div', { class: 'test-dont-know' },
              el('button', {
                type: 'button', class: 'btn btn-ghost', 'aria-pressed': String(question.given === DONT_KNOW),
                onclick: () => { question.given = DONT_KNOW; repaint(); progress(); },
              }, t('test.dontKnow')))
          : null);
    };
    repaint();
  }

  function writtenBlock(block, node) {
    const [question] = block.questions;
    const input = el('input', {
      type: 'text', class: 'input', autocomplete: 'off', autocapitalize: 'off',
      autocorrect: 'off', spellcheck: 'false',
      placeholder: t('write.answerPlaceholder'), 'aria-label': t('write.answerPlaceholder'),
    });
    input.addEventListener('input', () => { question.given = input.value; progress(); });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      nextFocus(input);
    });
    mount(node, questionPrompt(question, placeOf(block, run.questions)), el('div', { class: 'answer-form' }, input));
  }

  /* Picking a slot then an answer from the pool fills the slot; picking a
     filled slot puts its answer back. An answer picked with no slot chosen
     goes to the first empty one. */
  function matchingBlock(block, node) {
    const chosen = block.questions.map(() => null);
    let active = 0;

    const firstEmpty = () => chosen.indexOf(null);

    function place(slot) {
      if (slot === active && chosen[slot] === null) return;
      if (chosen[slot] !== null) {
        chosen[slot] = null;
        block.questions[slot].given = undefined;
      }
      active = slot;
      repaint();
      progress();
    }

    function take(item) {
      const slot = active >= 0 ? active : firstEmpty();
      if (slot < 0) return;
      chosen[slot] = item;
      block.questions[slot].given = block.pool[item].text;
      active = firstEmpty();
      repaint();
      progress();
    }

    function repaint() {
      const used = new Set(chosen.filter((item) => item !== null));
      const rows = block.questions.map((question, slot) => el('div', { class: 'match-row' },
        matchPrompt(question),
        el('button', {
          type: 'button', class: 'match-slot',
          'aria-pressed': String(slot === active),
          'aria-label': chosen[slot] === null && slot !== active ? t('test.slotEmpty') : null,
          dataset: { filled: chosen[slot] === null ? '0' : '1' },
          onclick: () => place(slot),
        }, chosen[slot] !== null
          ? cardText(block.pool[chosen[slot]].text, block.pool[chosen[slot]].lang)
          : slot === active ? t('test.slotPick') : null)));
      const pool = block.pool.map((answer, item) => (used.has(item) ? null : el('button', {
        type: 'button', class: 'match-chip', onclick: () => take(item),
      }, cardText(answer.text, answer.lang))));
      mount(node,
        matchHead(placeOf(block, run.questions)),
        el('div', { class: 'match-rows' }, rows),
        el('div', { class: 'match-pool' }, pool));
    }

    repaint();
  }

  const BLOCKS = { truefalse: optionsBlock, choice: optionsBlock, matching: matchingBlock, written: writtenBlock };

  function paint() {
    const list = run.blocks.map((block) => {
      const node = el('section', { class: 'test-question' });
      BLOCKS[block.kind](block, node);
      return node;
    });
    const submitButton = el('button', {
      type: 'button', class: 'btn btn-primary btn-lg test-submit', onclick: () => submit(false),
    }, t('test.submit'));
    mount(stage,
      el('div', { class: 'test-list' }, list),
      el('div', { class: 'sticky-actions test-foot' }, run.clock ? run.clock.node : null, submitButton));
    progress();
  }

  /* timedOut hands the test in as it stands, with no question asked. */
  function submit(timedOut) {
    if (!run) return;
    const blank = run.questions.filter((question) => !answered(question)).length;
    if (!timedOut && blank && !confirm(tn('test.confirmBlank', blank))) return;
    if (run.clock) run.clock.stop();

    const settings = store.getSettings();
    const verdicts = new Map();
    let correct = 0;
    for (const question of run.questions) {
      const verdict = grade(question, settings);
      verdicts.set(question, verdict);
      store.recordAnswer(set.id, question.card.id, verdict.correct);
      if (verdict.correct) correct += 1;
    }
    const { blocks, questions, startedAt } = run;
    const total = questions.length;
    run = null;
    saveSession(set.id, { mode: 'test', total, correct, ms: Date.now() - startedAt });
    shell.setProgress(total, total);
    showResult({ blocks, questions, verdicts, correct, total, blank, timedOut });
  }

  function verdictChip(verdict) {
    const almost = verdict.result && verdict.result.verdict === 'almost';
    return el('span', { class: 'chip', dataset: { state: verdict.correct ? 'correct' : 'wrong' } },
      icon(verdict.correct ? 'check' : 'close'),
      t(verdict.correct ? (almost ? 'quiz.almost' : 'quiz.correct') : 'quiz.wrong'));
  }

  function gradedBlock(block, questions, verdicts) {
    const place = placeOf(block, questions);
    if (block.kind === 'matching') {
      return el('section', { class: 'test-question' },
        matchHead(place),
        el('div', { class: 'match-rows' }, block.questions.map((question) => {
          const { correct } = verdicts.get(question);
          return el('div', { class: 'match-row' },
            matchPrompt(question),
            el('div', {},
              el('div', { class: 'match-slot', dataset: { filled: '1', state: correct ? 'correct' : 'wrong' } },
                answered(question) ? cardText(question.given, question.answerLang) : t('test.noAnswer')),
              correct ? null : el('p', { class: 'field-hint' },
                interpolateNode('quiz.expected', 'answer', cardText(question.answer, question.answerLang)))));
        })));
    }

    const [question] = block.questions;
    const verdict = verdicts.get(question);
    let body;
    if (question.kind === 'written') {
      /* The banner only has news when it shows an answer: the one expected,
         or the exact spelling of one accepted without its accents or with a
         typo. The answer is the one the learner came closest to. */
      const result = verdict.result || { verdict: 'wrong', accent: false, answer: question.answer };
      body = [
        typedAnswer(question.given || ''),
        result.verdict === 'correct' && !result.accent ? null : feedbackBanner(result.verdict, {
          expected: result.answer || question.answer, accent: result.accent, lang: question.answerLang,
        }),
      ];
    } else {
      body = optionButtons(question, { picked: question.given, graded: true, onPick: () => {} });
    }
    const right = rightPair(question);
    return el('section', { class: 'test-question' },
      verdictChip(verdict),
      questionPrompt(question, place),
      body,
      answered(question) && question.given !== DONT_KNOW
        ? null
        : el('p', { class: 'field-hint' }, t('test.noAnswer')),
      right ? el('p', { class: 'field-hint' }, right) : null);
  }

  function showResult({ blocks, questions, verdicts, correct, total, blank, timedOut }) {
    const missed = questions.filter((question) => !verdicts.get(question).correct).map((question) => question.card);

    mount(stage,
      summaryPanel({
        score: formatPercent(pct(correct, total)),
        scoreLabel: tn('quiz.resultBody', correct, { total }),
        title: t(timedOut ? 'quiz.timeUp' : 'quiz.resultTitle'),
        body: blank ? tn('quiz.unanswered', blank) : null,
        actions: [
          missed.length
            ? el('button', {
                type: 'button', class: 'btn btn-primary', onclick: () => begin(missed),
              }, icon('restart'), t('quiz.retryMissed'))
            : null,
          el('button', { type: 'button', class: 'btn', onclick: showSetup }, icon('restart'), t('common.restart')),
          el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
        ].filter(Boolean),
      }),
      el('h2', { class: 'test-review-title' }, t('test.review')),
      el('div', { class: 'test-list' }, blocks.map((block) => gradedBlock(block, questions, verdicts))));
    window.scrollTo(0, 0);
  }

  showSetup();
  return shell.root;
}
