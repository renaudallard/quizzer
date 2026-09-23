/* Pieces every study mode needs. Keeping them here is what stops the five modes
   from growing five copies of the same card, banner and summary. */

import { el, icon, mount } from './dom.js';
import { t, getLocale } from './i18n/index.js';
import { getSettings, recordSession } from './store.js';
import { onCleanup } from './router.js';
import { cardRow } from './views/shared.js';

export function cardText(text, lang) {
  return el('span', lang ? { lang } : {}, text);
}

/* Drops a node into a translated sentence where its placeholder sits, so the
   answer keeps its own lang attribute and the translator keeps the wording. */
function interpolateNode(key, name, node) {
  const [before, after] = t(key, { [name]: '\u0000' }).split('\u0000');
  return el('span', {}, before, node, after || null);
}

/* The page frame shared by every mode: back arrow, title, counter, progress. */
export function studyShell({ set, modeKey }) {
  const counter = el('p', { class: 'count' });
  const fill = el('div', { class: 'progress-fill', style: { width: '0%' } });
  const bar = el('div', {
    class: 'progress', role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
    'aria-label': t(modeKey),
  }, fill);
  const body = el('div');

  const root = el('div', { class: 'study' },
    el('div', { class: 'study-head' },
      el('a', { class: 'icon-btn', href: '#/set/' + set.id, 'aria-label': t('common.back') }, icon('back')),
      el('h1', {}, t(modeKey)),
      counter),
    el('p', { class: 'chart-sub' }, set.title),
    bar,
    body);

  function setProgress(done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    fill.style.width = percent + '%';
    bar.setAttribute('aria-valuenow', String(percent));
    counter.textContent = total ? t('progress.position', { current: done, total }) : '';
  }

  return { root, body, setProgress };
}

export function speakButton(text, lang) {
  if (!getSettings().speech) return null;
  if (typeof speechSynthesis === 'undefined') return null;
  return el('button', {
    type: 'button', class: 'icon-btn', 'aria-label': t('common.speak'),
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      speak(text, lang);
    },
  }, icon('sound'));
}

export function speak(text, lang) {
  if (typeof speechSynthesis === 'undefined' || !getSettings().speech) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = lang || getLocale();
  speechSynthesis.speak(utterance);
}

/* A two sided card shared by the flashcard and spaced review modes. The card
   is a real button, so any keyboard or screen reader can turn it, and only
   the side in view is exposed: the other one stays hidden from assistive
   technology until it is turned, and the side that comes into view is
   announced. Read aloud sits under the card, since a button cannot hold
   another one, and speaks whichever side is showing. */
export function flipCard({ onFlip } = {}) {
  const front = el('span', { class: 'flashcard-face' });
  const back = el('span', { class: 'flashcard-face flashcard-back' });
  const card = el('button', {
    type: 'button', class: 'flashcard', dataset: { flipped: '0' },
    onclick: () => api.flip(),
  }, el('span', { class: 'flashcard-inner' }, front, back));
  const voice = el('div', { class: 'flashcard-tools' });
  const live = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const root = el('div', { class: 'flashcard-wrap' }, card, voice, live);
  let specs = [null, null];

  function face(node, { label, text, lang, hint }) {
    mount(node,
      el('span', { class: 'side' }, label),
      el('span', { class: 'content' }, cardText(text, lang)),
      hint ? el('span', { class: 'hint' }, hint) : null);
  }

  function show(flipped) {
    const [shown, hidden] = flipped ? [back, front] : [front, back];
    shown.removeAttribute('aria-hidden');
    hidden.setAttribute('aria-hidden', 'true');
    const spec = specs[flipped ? 1 : 0];
    if (!spec) return;
    mount(voice, speakButton(spec.text, spec.lang));
    live.textContent = spec.label + ': ' + spec.text;
  }

  const api = {
    root,
    get flipped() { return card.dataset.flipped === '1'; },
    /* A new card always starts on its front. */
    setFaces(frontSpec, backSpec) {
      specs = [frontSpec, backSpec];
      face(front, frontSpec);
      face(back, backSpec);
      card.dataset.flipped = '0';
      show(false);
    },
    flip(force) {
      const next = force === undefined ? !api.flipped : Boolean(force);
      card.dataset.flipped = next ? '1' : '0';
      show(next);
      if (onFlip) onFlip(next);
      return next;
    },
  };
  return api;
}

/* Text answer input plus its submit button, wired so Enter always works. */
export function answerField({ placeholder, submitLabel, onSubmit, autoFocus = true }) {
  const input = el('input', {
    type: 'text', class: 'input', autocomplete: 'off', autocapitalize: 'off',
    autocorrect: 'off', spellcheck: 'false', placeholder,
    'aria-label': placeholder,
  });
  const form = el('form', {
    class: 'answer-form',
    onsubmit: (event) => { event.preventDefault(); onSubmit(input.value); },
  }, input, el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel));

  if (autoFocus) queueMicrotask(() => input.focus());
  return { root: form, focus: () => input.focus() };
}

const BANNERS = {
  correct: { class: 'banner-good', glyph: 'check', title: 'quiz.correct' },
  almost: { class: 'banner-warn', glyph: 'alert', title: 'quiz.almost' },
  wrong: { class: 'banner-bad', glyph: 'close', title: 'quiz.wrong' },
};

/* An answer accepted despite missing accents still shows its exact spelling,
   which is what the accent flag from grade() is for. */
function feedbackBanner(verdict, { expected, accent, lang } = {}) {
  const spec = BANNERS[verdict] || BANNERS.wrong;
  const answerKey = verdict === 'correct' ? 'quiz.spelling' : 'quiz.expected';
  return el('div', { class: 'banner ' + spec.class, role: 'status', 'aria-live': 'polite' },
    icon(spec.glyph),
    el('div', { class: 'banner-body' },
      el('strong', { class: 'banner-title' }, t(spec.title)),
      expected ? interpolateNode(answerKey, 'answer', cardText(expected, lang)) : null,
      accent && verdict !== 'correct' ? el('small', {}, ' ', t('quiz.accentNote')) : null));
}

/* The typed answer, kept on screen read only once it has been graded. */
export function typedAnswer(value) {
  return el('div', { class: 'answer-form' },
    el('input', {
      type: 'text', class: 'input', readonly: true,
      value, 'aria-label': t('write.answerPlaceholder'),
    }));
}

/* What follows an answer in quiz and write: the verdict, the expected answer
   when it was missed, an optional note, the "I had it" claim when one is
   offered, and Continue, which takes the focus. result is what gradeAny()
   returned for a typed answer: its answer, the one the learner came closest
   to, may belong to another card with the same prompt, and is the one shown. */
export function answerFeedback({ correct, result, expected, lang, note, onOverride, onContinue }) {
  const verdict = correct ? (result && result.verdict === 'almost' ? 'almost' : 'correct') : 'wrong';
  const accent = Boolean(result && result.accent);
  const answer = (result && result.answer) || expected;
  const next = el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: onContinue },
    t('common.continue'), icon('right'));
  queueMicrotask(() => next.focus());
  return el('div', {},
    feedbackBanner(verdict, {
      expected: verdict === 'correct' && !accent ? null : answer,
      accent,
      lang,
    }),
    note ? el('p', { class: 'field-hint', style: { marginTop: '8px' } }, note) : null,
    el('div', { class: 'study-nav', style: { marginTop: '18px' } },
      onOverride && !correct
        ? el('button', { type: 'button', class: 'btn', onclick: onOverride }, icon('check'), t('quiz.override'))
        : null,
      next));
}

export function summaryPanel({ score, scoreLabel, title, body, actions, missed, langs }) {
  return el('div', { class: 'summary' },
    score !== undefined ? el('p', { class: 'summary-score' }, score) : null,
    scoreLabel ? el('p', { class: 'summary-label' }, scoreLabel) : null,
    title ? el('h2', {}, title) : null,
    body ? el('p', {}, body) : null,
    el('div', { class: 'summary-actions' }, actions),
    missed && missed.length
      ? el('div', { class: 'panel summary-list' },
          el('h3', {}, t('quiz.missed')),
          el('div', { class: 'card-list' }, missed.map((card) => cardRow(card, langs))))
      : null);
}

export function saveSession(setId, { mode, total, correct, ms }) {
  if (!total) return;
  recordSession(setId, { mode, total, correct, ms });
}

const ACTIVATABLE = 'button, a[href]';

/* Document level shortcuts for a study mode, taken back down when the route
   changes. Typing in a field is never intercepted, and Enter or Space on a
   focused control is left to that control: the browser already activates it,
   so handling the key here as well would fire the action twice. */
export function bindKeys(handler) {
  const listener = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((event.key === 'Enter' || event.key === ' ')
      && target instanceof Element && target.closest(ACTIVATABLE)) return;
    handler(event);
  };
  document.addEventListener('keydown', listener);
  onCleanup(() => document.removeEventListener('keydown', listener));
}
