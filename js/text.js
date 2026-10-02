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

/* Superscript letters are the plain letters of an abbreviation, as in
   "1ᵉʳ" or "Mˡˡᵉ", so they fold to them. */
export function normalize(text, stripAccents = true) {
  let out = String(text).normalize('NFC').toLowerCase().trim();
  out = out.replace(/\p{Lm}/gu, (char) => char.normalize('NFKC'));
  out = out.replace(/[œæß]/g, (char) => LIGATURES[char]);
  if (stripAccents) out = out.normalize('NFD').replace(DIACRITICS, '').replace(/[øłđı]/g, (char) => STROKES[char]);
  out = out.replace(SIGN, '$1−').replace(DIGIT_GROUP, '$1').replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/* Maths keeps what words may drop: brackets and minus signs decide what a
   formula means, so "2x+1" is not "2(x+1)". Text is maths when it holds an
   operator or a maths sign, a number followed by an exclamation mark, which
   is a factorial, a pi that is not part of a Greek word, a Greek letter set
   against a Latin letter or a digit, as "Δx", or when it is built only from
   single letters, digits, operators and primes, as "x-y" or "u'/u". A
   function name such as sin or ln counts as a single letter. Superscript
   letters are exponents, as in "eˣ", unless a word sits next to them, as
   in "XIXᵉ siècle", or they end an abbreviation: two or more of them, or
   a lone ᵉ, after a digit or a capital, as in "1ᵉʳ", "2ᵉ" or "Mᵐᵉ". Arrows and the
   signs of sets and logic only make a formula without words, so
   "cheval → chevaux" stays text while "x → 0" does not. */
const MATH_SIGN = /[+=<>×÷*^√∑∏∫∬∮±∓≤≥≠≈≡∝∞∂∇⇌⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ½¼¾⅓⅔]|\d!|(^|[^\p{Script=Greek}])π(?!\p{Script=Greek})|\p{Script=Greek}[a-z\d]|[a-z\d]\p{Script=Greek}/iu;
const FORMULA = /^[\s\p{L}\d.,()[\]{}+\-−*/^_=<>!|'′→⇒⇔↔∈∉⊂⊆∪∩∀∃¬∧∨]*$/u;
const OPERATOR = /[-−*/^_=<>()[\]{}!|→⇒⇔↔∈∉⊂⊆∪∩∀∃¬∧∨]/u;
const FUNCTIONS = 'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|ln|log|exp|sqrt';
const FUNCTION_NAME = new RegExp('\\b(?:' + FUNCTIONS + ')\\b', 'gi');
const FUNCTION_CALL = new RegExp('(' + FUNCTIONS + ')(\\^[\\p{L}\\d]+)?\\(([\\p{L}\\d.]+)\\)', 'gu');
const LETTER_EXPONENTS = 'ᵃᵇᶜᵈᵉⁱᵏᵐᵖᵗᵘᵛˣʸᶻ⁼⁽⁾';
const ABBREVIATION = /(?<=[\d\p{Lu}])(?:\p{Lm}{2,}|ᵉ)(?!\p{Lm})/gu;

export function isMath(text) {
  const value = String(text).replace(ABBREVIATION, '');
  if (MATH_SIGN.test(value)) return true;
  const bare = value.replace(FUNCTION_NAME, 'f');
  const chars = [...bare];
  if (chars.some((char) => LETTER_EXPONENTS.includes(char))
    && !/\p{L}{2}/u.test(chars.filter((char) => !LETTER_EXPONENTS.includes(char)).join(''))) return true;
  return FORMULA.test(bare) && /\p{L}/u.test(bare) && !/\p{L}{2}/u.test(bare) && OPERATOR.test(bare);
}

/* Signs a keyboard lacks, as they are typed instead: x^2 for x², H2O for
   H₂O, x_n for xₙ, sqrt for √, <= for ≤, -> for →, pi or alpha for the
   Greek letters. An exponent or an index with a sign inside holds
   together, as it is typed: xⁿ⁻¹ is x^(n-1) and uₙ₊₁ is u_(n+1). */
const SUPERSCRIPTS = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ⁱ': 'i', 'ᵏ': 'k', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵖ': 'p',
  'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
};
const SUBSCRIPTS = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o',
  'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x',
};
const run = (table) => new RegExp('[' + Object.keys(table).join('') + ']+', 'g');
const SUPERSCRIPT_RUN = run(SUPERSCRIPTS);
const SUBSCRIPT_RUN = run(SUBSCRIPTS);
const SPELLED = {
  '×': '*', '·': '*', '÷': '/', '⁄': '/', '−': '-', '–': '-', '≤': '<=', '≥': '>=', '≠': '!=', '√': 'sqrt', '′': "'",
  '±': '+-', '≈': '~=', '→': '->', '⇒': '=>', '⇌': '<=>', '⇔': '<=>', '↔': '<->',
  '∞': 'inf', '∫': 'int', '∑': 'sum', '∏': 'prod', '∂': 'partial', '∇': 'nabla', '∈': 'in', 'ℕ': 'n', 'ℤ': 'z', 'ℚ': 'q', 'ℝ': 'r', 'ℂ': 'c',
  '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta',
  'θ': 'theta', 'ι': 'iota', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'ς': 'sigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi', 'χ': 'chi',
  'ψ': 'psi', 'ω': 'omega',
};
const SPELLED_SIGN = new RegExp('[' + Object.keys(SPELLED).join('') + ']', 'g');
/* A sign that ends an exponent or a chemical formula is a charge, as in
   SO4^2- or Na+ + Cl-, when nothing or another operator follows it. */
const CHARGE = '[+\\-−](?!>)(?=\\s*(?:$|[+\\-−=<>→⇌⇔↔]))';
const EXPONENT_CHARGE = new RegExp('\\^(\\d*)(' + CHARGE + ')', 'gu');
const BARE_CHARGE = new RegExp('([\\p{L}\\d)\\]])(' + CHARGE + ')', 'gu');

/* A run of superscripts or subscripts as it is typed after its caret or
   underscore, in brackets when it holds a sign after its first character. */
function script(mark, plain) {
  return mark + (/.[-+=]/.test(plain) && !plain.startsWith('(') ? '(' + plain + ')' : plain);
}

/* A formula is compared as written, apart from case, spaces, a decimal
   comma and the signs spelled as they are typed. Brackets around a single
   term after a function name, a caret or an underscore may go, so sin(x)
   is sin x and x^(2) is x². An index made of digits needs no underscore,
   as in H2O. A star or a point between letters, and a star between
   anything but two digits, is a product that may as well be left out: 2*x
   is 2x and mol.L is mol·L. */
function formula(text) {
  const out = String(text).normalize('NFC').toLowerCase()
    .replace(SUPERSCRIPT_RUN, (found) => script('^', [...found].map((char) => SUPERSCRIPTS[char]).join('')))
    .replace(SUBSCRIPT_RUN, (found) => {
      const plain = [...found].map((char) => SUBSCRIPTS[char]).join('');
      return /^\d+$/.test(plain) ? plain : script('_', plain);
    })
    .replace(SPELLED_SIGN, (char) => SPELLED[char])
    .replace(/infinity/g, 'inf')
    .replace(/([\^_])\{([^{}]*)\}/g, '$1($2)')
    .replace(EXPONENT_CHARGE, (found, digits, sign) => (digits ? '^(' + digits + sign + ')' : '^' + sign))
    .replace(BARE_CHARGE, '$1^$2')
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/(\p{L})\.(?=\p{L})/gu, '$1*')
    .replace(/\s+/g, '');
  return out.replace(/\*/g, (star, at) => (/\d/.test(out[at - 1] || '') && /\d/.test(out[at + 1] || '') ? star : ''))
    .replace(/([\^_])\(([\p{L}\d]+)\)/gu, '$1$2')
    .replace(/_(?=\d)/g, '')
    .replace(FUNCTION_CALL, '$1$2$3');
}

/* Writes the notation typed on a keyboard with the signs it stands for, as
   the editor does when a field is left: x^2 is x², H_2O is H₂O,
   SO_4^(2-) is SO₄²⁻ and -> is →. A caret or an underscore takes a group
   in brackets or braces, or else a number, a single letter that no letter
   or digit follows, and a closing charge. Unicode lacks some superscript
   and subscript letters, such as q: what has no such sign is left alone. */
const TYPED = { '<=>': '⇌', '<->': '↔', '->': '→', '=>': '⇒', '<=': '≤', '>=': '≥', '!=': '≠' };
const TYPED_SIGN = /<=>|<->|->|=>|<=|>=|!=/g;
const SCRIPT = new RegExp('([\\^_])(?:\\(([^()]+)\\)|\\{([^{}]+)\\}|((?:[+\\-−]?(?:\\d+|\\p{L}(?![\\p{L}\\d])))(?:'
  + CHARGE + ')?|' + CHARGE + '))', 'gu');
const invert = (table) => Object.fromEntries(Object.entries(table).map(([sign, plain]) => [plain, sign]));
const SCRIPTS = { '^': invert(SUPERSCRIPTS), '_': invert(SUBSCRIPTS) };

export function typeset(text) {
  return String(text).replace(TYPED_SIGN, (found) => TYPED[found])
    .replace(SCRIPT, (found, mark, bracketed, braced, bare) => {
      const signs = [...(bracketed || braced || bare).replace(/\s+/g, '')]
        .map((char) => SCRIPTS[mark][char === '−' ? '-' : char]);
      return !signs.length || signs.includes(undefined) ? found : signs.join('');
    });
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

/* A number is right or wrong: one digit more or less is another number. */
const NUMBER = /^−?\d+( \d+)*$/;

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
    if (typos && !NUMBER.test(loose) && levenshtein(givenLoose, loose) <= typoBudget(loose.length)) near = true;
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
