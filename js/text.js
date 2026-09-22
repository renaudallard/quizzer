/* Answer comparison. Learners should not lose a point over a missing accent or
   a slipped key, so grading has three outcomes: correct, almost, wrong. */

const PUNCT = /[.,;:!?"'‘’“”()[\]{}¿¡]/g;
const DIACRITICS = /[̀-ͯ]/g;

export function normalize(text, stripAccents = true) {
  let out = String(text).normalize('NFC').toLowerCase().trim();
  out = out.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (stripAccents) out = out.normalize('NFD').replace(DIACRITICS, '');
  out = out.replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/* A definition may list alternatives with a slash or semicolon, and may put an
   optional precision in brackets: "voiture / auto (familier)". */
export function acceptedAnswers(definition) {
  const variants = new Set();
  for (const part of String(definition).split(/[/;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    variants.add(trimmed);
    const withoutBrackets = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutBrackets) variants.add(withoutBrackets);
  }
  if (variants.size === 0) variants.add(String(definition).trim());
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
  const variants = acceptedAnswers(expected);
  const given = normalize(input, false);
  const givenLoose = normalize(input, true);

  if (!given) return { verdict: 'wrong', accent: false };

  let accentOnly = false;
  let best = Infinity;

  for (const variant of variants) {
    const strict = normalize(variant, false);
    const loose = normalize(variant, true);
    if (given === strict) return { verdict: 'correct', accent: false };
    if (givenLoose === loose) {
      if (accents) return { verdict: 'correct', accent: true };
      accentOnly = true;
      continue;
    }
    best = Math.min(best, levenshtein(givenLoose, loose));
  }

  if (accentOnly) return { verdict: 'almost', accent: true };
  if (typos && best <= typoBudget(Math.max(givenLoose.length, 1))) {
    return { verdict: 'almost', accent: false };
  }
  return { verdict: 'wrong', accent: false };
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
