/* The manual. Its examples are code rather than catalogue text: they read the
   same in every language, the written forms come from the functions that do
   the work, so they cannot drift from them, and LaTeX braces would pass for
   placeholders in the catalogue checks. */

import { el } from '../dom.js';
import { t } from '../i18n/index.js';
import { typeset, plain } from '../text.js';
import { richText } from '../math.js';

/* What the editor writes once a field is left. */
const NOTATION = [
  'x^2', '10^-19', 'e^x', 'x^(n-1)', 'H_2O', 'C_6H_12O_6', 'u_(n+1)',
  'SO_4^(2-)', 'Fe^3+ + 3OH^-', '->', '<=>', '<->', '=>', '<=', '>=', '!=',
];

/* How a card holding LaTeX looks, and the one line form it is graded by. */
const LATEX = [
  '$\\frac{1}{2}$', '$\\sqrt{b^2-4ac}$', '$\\int_0^1 x^2\\,dx$',
  '$x \\in \\mathbb{R}$', '$u_{n+1}$', '$\\sqrt[3]{x}$', '$90^\\circ$',
  '$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$', '$\\ce{SO4^2-}$',
  '$\\ce{CuSO4.5H2O}$', '$\\ce{N2 + 3H2 <=> 2NH3}$', '$\\ce{Fe^3+}$',
];

/* A typed answer and a card answer it is right for. Exported so the test
   page can hold the grading to it. */
export const TYPED = [
  ['x^2', 'x²'], ['H2O', 'H₂O'], ['x_1', 'x₁'], ['2*x', '2 × x'],
  ['a/b', 'a ÷ b'], ['x<=1', 'x ≤ 1'], ['x!=0', 'x ≠ 0'], ['+-1', '±1'],
  ['x~=y', 'x ≈ y'], ['sqrt(2)', '√2'], ['1/2', '½'], ['inf', '∞'],
  ['x in R', 'x ∈ ℝ'], ['alpha+beta', 'α + β'], ['sin x', 'sin(x)'],
  ["u'/u", 'u′/u'], ['mol.L^-1', 'mol·L⁻¹'], ['x^(n-1)', 'xⁿ⁻¹'],
  ['Na+ + Cl- -> NaCl', 'Na⁺ + Cl⁻ → NaCl'], ['Fe^3+', 'Fe³⁺'],
  ['(x+1)/2', '$\\frac{x+1}{2}$'], ['\\frac{1}{2}', '1/2'],
];

const MODES = ['flashcards', 'learn', 'review', 'quiz', 'write', 'match', 'stats'];

/* Interface labels the text names, filled in so it always says what the
   buttons say. */
function labels() {
  const keys = {
    create: 'nav.create', transfer: 'nav.transfer', settings: 'nav.settings',
    samples: 'home.cta.samples', goal: 'stat.goal',
    termLang: 'editor.termLang', defLang: 'editor.defLang', addCard: 'editor.addCard',
    bulk: 'editor.bulk', hint: 'common.hint', image: 'editor.image', symbols: 'editor.symbols',
    reverse: 'flashcards.reverse', starred: 'flashcards.starredOnly', sort: 'flashcards.sort',
    know: 'flashcards.know', learning: 'flashcards.learning',
    again: 'review.again', good: 'review.good', anyway: 'review.anyway',
    retryMissed: 'quiz.retryMissed', almost: 'quiz.almost', wrong: 'quiz.wrong',
    override: 'quiz.override',
    tierNew: 'stats.tier.new', tierLearning: 'stats.tier.learning',
    tierFamiliar: 'stats.tier.familiar', tierMastered: 'stats.tier.mastered',
    accents: 'settings.accents', typos: 'settings.typos', reset: 'settings.reset',
    exportAll: 'transfer.exportAll', csvFile: 'transfer.csvFile',
    share: 'set.share', exportCsv: 'transfer.exportSetCsv', print: 'common.print',
  };
  return Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, t(key)]));
}

/* Text between backticks is shown as typed. */
function prose(text) {
  return text.split('`').map((part, i) => (i % 2 ? el('code', {}, part) : part));
}

function table(heads, rows) {
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'table help-table' },
      el('thead', {}, el('tr', {}, heads.map((head) => el('th', { scope: 'col' }, t(head))))),
      el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell) => el('td', {}, cell)))))));
}

const code = (text) => el('code', {}, text);

const TABLES = {
  notation: () => table(['help.col.typed', 'help.col.written'],
    NOTATION.map((typed) => [code(typed), typeset(typed)])),
  latex: () => table(['help.col.source', 'help.col.shown', 'help.col.readAs'],
    LATEX.map((source) => [code(source), richText(source), plain(source)])),
  typed: () => table(['help.col.typed', 'help.col.acceptedFor'],
    TYPED.map(([typed, expected]) => [code(typed), richText(expected)])),
  modes: (vars) => el('dl', { class: 'help-modes' },
    MODES.map((mode) => [el('dt', {}, t('mode.' + mode)), el('dd', {}, prose(t('help.modes.' + mode, vars)))])),
};

/* Each section is its paragraphs in order, a table standing in for one
   where its name is in TABLES. */
const SECTIONS = [
  ['start', ['p1', 'p2', 'p3', 'p4', 'p5']],
  ['modes', ['p1', 'modes']],
  ['schedule', ['p1', 'p2', 'p3', 'p4']],
  ['cards', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']],
  ['formulas', ['p1', 'notation', 'p2']],
  ['latex', ['p1', 'latex', 'p2', 'p3', 'p4']],
  ['grading', ['p1', 'p2', 'p3', 'p4', 'typed', 'p5', 'p6']],
  ['transfer', ['p1', 'p2', 'p3']],
  ['data', ['p1', 'p2', 'p3']],
];

/* section names a part to open on, as #/help/latex does. */
export function helpView(section) {
  const vars = labels();
  const headingId = (id) => 'help-' + id;

  /* The router focuses the page once it is mounted, so wait for that, and
     only move when the page itself has the focus: a rebuild after a
     language change leaves the reader where they were. */
  const show = (id) => {
    const heading = document.getElementById(headingId(id));
    if (!heading) return;
    heading.scrollIntoView();
    heading.focus({ preventScroll: true });
  };
  if (SECTIONS.some(([id]) => id === section)) {
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active && active.contains(document.getElementById(headingId(section)))) show(section);
    });
  }

  /* Following a link to the part already in the address changes no hash,
     so the link moves there itself. */
  const tocLink = (id) => el('a', {
    href: '#/help/' + id,
    onclick: (event) => {
      if (location.hash !== '#/help/' + id) return;
      event.preventDefault();
      show(id);
    },
  }, t('help.' + id + '.title'));

  return el('div', { class: 'container container-narrow stack help' },
    el('h1', {}, t('help.title')),
    el('p', { class: 'lede' }, t('help.lede')),
    el('nav', { class: 'panel', 'aria-label': t('help.toc') },
      el('ol', { class: 'help-toc' }, SECTIONS.map(([id]) => el('li', {}, tocLink(id))))),
    SECTIONS.map(([id, blocks]) => el('section', { class: 'panel', 'aria-labelledby': headingId(id) },
      el('h2', { id: headingId(id), tabindex: '-1' }, t('help.' + id + '.title')),
      blocks.map((block) => (TABLES[block]
        ? TABLES[block](vars)
        : el('p', {}, prose(t('help.' + id + '.' + block, vars))))))),
    el('p', {}, el('a', { class: 'btn', href: '#/shortcuts' }, t('nav.shortcuts'))));
}
