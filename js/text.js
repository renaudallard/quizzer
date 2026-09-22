/* Answer comparison. Learners should not lose a point over a missing accent or
   a slipped key, so grading has three outcomes: correct, almost, wrong. */

/* Punctuation that carries no meaning in an answer, French quotes, dashes and
   hyphens included. Symbols such as # / % & keep their meaning. */
const PUNCT = /[.,;:!?"'‘’‚‛“”„‟«»‹›()[\]{}¿¡…·‐‑‒–—―-]/g;
const DIACRITICS = /[̀-ͯ]/g;
/* Ligatures are spelling, not accents: "coeur" is how "cœur" is typed. */
const LIGATURES = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' };
/* Letters that NFD does not split into a base and a mark. */
const STROKES = { 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ı': 'i' };

export function normalize(text, stripAccents = true) {
  let out = String(text).normalize('NFC').toLowerCase().trim();
  out = out.replace(/[œæß]/g, (char) => LIGATURES[char]);
  if (stripAccents) out = out.normalize('NFD').replace(DIACRITICS, '').replace(/[øłđı]/g, (char) => STROKES[char]);
  out = out.replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/* Spaces are ignored when grading, so a dropped apostrophe or hyphen is not a
   mistake: "leau" matches "l'eau" and "pays bas" matches "Pays-Bas". */
function compact(text) {
  return text.replace(/ /g, '');
}

/* Splits on the separators that sit outside brackets: a semicolon, or a slash
   with a space beside it. A bare slash belongs to the answer, as in "km/h",
   "24/7" or "collègue (m/f)". */
function splitAlternatives(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === ';'
      || (char === '/' && (/\s/.test(text[i - 1] || '') || /\s/.test(text[i + 1] || ''))))) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/* A definition may list alternatives with " / " or ";", and may put an
   optional precision in brackets: "voiture / auto (familier)". The whole
   definition is always accepted as well. */
export function acceptedAnswers(definition) {
  const whole = String(definition).trim();
  const variants = new Set();
  for (const part of [whole, ...splitAlternatives(whole)]) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    variants.add(trimmed);
    const withoutBrackets = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutBrackets) variants.add(withoutBrackets);
  }
  if (variants.size === 0) variants.add(whole);
  return [...variants];
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function typoBudget(length) {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return 2;
}

/* Returns { verdict, accent } where accent flags an answer that only differs by
   its diacritics, so the interface can point that out without failing anyone. */
export function grade(input, expected, options = {}) {
  const { accents = true, typos = true } = options;
  const typed = String(input).trim();
  if (!typed) return { verdict: 'wrong', accent: false };
  const given = compact(normalize(typed, false));
  const givenLoose = compact(normalize(typed, true));

  let accentOnly = false;
  let near = false;

  for (const variant of acceptedAnswers(expected)) {
    const strict = compact(normalize(variant, false));
    const loose = compact(normalize(variant, true));
    /* An answer made only of punctuation, such as "?", is compared as typed. */
    if (!strict) {
      if (typed === variant.trim()) return { verdict: 'correct', accent: false };
      continue;
    }
    if (given === strict) return { verdict: 'correct', accent: false };
    if (givenLoose === loose) {
      if (accents) return { verdict: 'correct', accent: true };
      accentOnly = true;
      continue;
    }
    /* The allowance follows the expected answer, so padding a short answer
       cannot buy a typo and a long answer keeps its slack. */
    if (typos && levenshtein(givenLoose, loose) <= typoBudget(loose.length)) near = true;
  }

  if (accentOnly) return { verdict: 'almost', accent: true };
  if (near) return { verdict: 'almost', accent: false };
  return { verdict: 'wrong', accent: false };
}

const RANK = { correct: 2, almost: 1, wrong: 0 };

/* Grades against several answers that are all right, such as the terms of
   two cards that both mean "bonjour", and keeps the best verdict. */
export function gradeAny(input, answers, options = {}) {
  let best = null;
  for (const expected of answers) {
    const result = grade(input, expected, options);
    if (!best || RANK[result.verdict] > RANK[best.verdict]) best = result;
    if (best.verdict === 'correct' && !best.accent) break;
  }
  return best || { verdict: 'wrong', accent: false };
}

/* Progressive hint: keeps the first letter of every word and the punctuation. */
export function maskAnswer(text) {
  return String(text).replace(/\p{L}[\p{L}\p{M}'-]*/gu, (word) => {
    if (word.length <= 1) return word;
    return word[0] + '·'.repeat(Math.min(word.length - 1, 12));
  });
}

export function truncate(text, max) {
  const value = String(text);
  return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value;
}
