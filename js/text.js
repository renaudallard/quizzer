/* Answer comparison. Learners should not lose a point over a missing accent or
   a slipped key, so grading has three outcomes: correct, almost, wrong. */

/* Punctuation that carries no meaning in an answer, French quotes, dashes and
   hyphens included. Symbols such as # / % & keep their meaning. */
const PUNCT = /[.,;:!?"'‘’‚‛“”„‟«»‹›()[\]{}¿¡…·‐‑‒–—―-]/g;
const DIACRITICS = /[\u0300-\u036f]/g;
/* Ligatures are spelling, not accents: "coeur" is how "cœur" is typed. */
const LIGATURES = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' };
/* Letters that NFD does not split into a base and a mark. */
const STROKES = { 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ı': 'i' };
/* A hyphen or dash that opens a number is a minus sign. It becomes U+2212,
   which the punctuation strip leaves alone, so "5" is not taken for "-5". */
const SIGN = /(^|[^\p{L}\d])[-–](?=\d)/gu;
/* A space followed by three digits only groups them, as in "1 000", so it
   goes before the punctuation strip turns a point, comma or colon into one. */
const DIGIT_GROUP = /(\d)\s+(?=\d{3}(?!\d))/g;

export function normalize(text, stripAccents = true) {
  let out = String(text).normalize('NFC').toLowerCase().trim();
  out = out.replace(/[œæß]/g, (char) => LIGATURES[char]);
  if (stripAccents) out = out.normalize('NFD').replace(DIACRITICS, '').replace(/[øłđı]/g, (char) => STROKES[char]);
  out = out.replace(SIGN, '$1−').replace(DIGIT_GROUP, '$1').replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/* Maths keeps what words may drop: brackets and minus signs decide what a
   formula means, so "2x+1" is not "2(x+1)". Text is maths when it holds an
   operator or a maths sign, a number followed by an exclamation mark, which
   is a factorial, a pi that is not part of a Greek word, or when it is built
   only from single letters, digits and operators, as "x-y". */
const MATH_SIGN = /[+=<>×÷*^√∑∏∫±≤≥≠≈∞∂⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ₀₁₂₃₄₅₆₇₈₉]|\d!|(^|[^\p{Script=Greek}])π(?!\p{Script=Greek})/u;
const FORMULA = /^[\s\p{L}\d.,()[\]{}+\-−*/^=<>!|]*$/u;

export function isMath(text) {
  const value = String(text);
  if (MATH_SIGN.test(value)) return true;
  return FORMULA.test(value) && /\p{L}/u.test(value) && !/\p{L}{2}/u.test(value)
    && /[-−*/^=<>()[\]{}!|]/.test(value);
}

/* A formula is compared as written, apart from case, spaces, the look of a
   minus sign and a decimal comma. */
function formula(text) {
  return String(text).normalize('NFC').toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/\s+/g, '');
}

/* Two texts are the same prompt or the same answer when they differ only by
   case or punctuation. Accents count, since "ou" and "où" are different
   words, and text made only of punctuation is compared as written. A formula
   is compared as a formula. */
export function textKey(text) {
  if (isMath(text)) return formula(text);
  return normalize(text, false) || String(text).trim();
}

/* Spaces are ignored when grading, so a dropped apostrophe or hyphen is not a
   mistake: "leau" matches "l'eau" and "pays bas" matches "Pays-Bas". A space
   left between two digits stands for the point, comma or colon that kept
   them apart, so it stays: "3,14" never reads as "314". */
function compact(text) {
  return text.replace(/(\d) (?=\d)| /g, (match, digit) => (digit ? match : ''));
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
   definition is always accepted as well. A formula is taken whole, since
   its slashes divide and its brackets count. */
export function acceptedAnswers(definition) {
  const whole = String(definition).trim();
  if (isMath(whole)) return [whole];
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
    /* A formula is right or wrong: one sign more or less is another one. */
    if (isMath(variant)) {
      if (formula(typed) === formula(variant)) return { verdict: 'correct', accent: false };
      continue;
    }
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

/* An exact answer ranks above one that is only right once accents are
   forgiven, which ranks above a near miss. */
function rank({ verdict, accent }) {
  if (verdict === 'correct') return accent ? 3 : 4;
  return verdict === 'almost' ? 1 : 0;
}

/* Grades against several answers that are all right, such as the terms of
   two cards that both mean "bonjour", and keeps the best verdict with the
   answer it came from. On a tie the earlier answer wins, so the one asked
   for goes first. */
export function gradeAny(input, answers, options = {}) {
  let best = null;
  for (const answer of answers) {
    const result = { ...grade(input, answer, options), answer };
    if (!best || rank(result) > rank(best)) best = result;
    if (rank(best) === 4) break;
  }
  return best || { verdict: 'wrong', accent: false, answer: '' };
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
