/* Card text as it is shown: its tables, its line breaks and its LaTeX,
   drawn by KaTeX. KaTeX is fetched from vendor/katex the first time a
   card holds some, and until it is there, or if it cannot be loaded, each
   formula shows written on one line. */

import { el } from './dom.js';
import { segments, plain, blocks } from './text.js';

const BASE = new URL('../vendor/katex/', import.meta.url);
let katex = null;
let loading = null;
const waiting = new Set();

function script(file) {
  return new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = new URL(file, BASE).href;
    node.onload = resolve;
    node.onerror = reject;
    document.head.appendChild(node);
  });
}

/* Resolves once KaTeX is ready, or with null when it could not be loaded.
   Formulas drawn as text meanwhile are drawn again. */
export function mathReady() {
  if (!loading) {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = new URL('katex.min.css', BASE).href;
    document.head.appendChild(sheet);
    loading = script('katex.min.js')
      .then(() => script('contrib/mhchem.min.js'))
      .then(() => {
        katex = window.katex;
        return katex;
      }, () => null)
      .then((found) => {
        if (found) for (const job of waiting) draw(job);
        waiting.clear();
        return found;
      });
  }
  return loading;
}

/* KaTeX shows a mistake in the LaTeX in red rather than failing, and runs
   no command that could reach a link, a picture or the page. */
function draw({ node, tex, display, raw }) {
  try {
    katex.render(tex, node, { displayMode: display, throwOnError: false, strict: 'ignore' });
  } catch {
    node.textContent = plain(raw);
  }
}

/* Text with its line breaks. */
function lines(text) {
  return text.split('\n').flatMap((line, i) => (i ? [document.createElement('br'), line] : [line]));
}

/* Text with its line breaks and its LaTeX drawn. */
function inline(text) {
  return segments(text).flatMap((part) => {
    if (part.tex === undefined) return lines(part.text);
    const job = { node: document.createElement('span'), ...part };
    job.node.className = 'math';
    if (katex) draw(job);
    else {
      job.node.textContent = plain(part.raw);
      waiting.add(job);
      mathReady();
    }
    return job.node;
  });
}

/* A table written on a card. A header left empty is no header at all. */
function table({ head, align, rows }) {
  const cell = (tag, text, i) => el(tag, { style: align[i] ? { textAlign: align[i] } : null }, inline(text));
  return el('span', { class: 'card-table-wrap' },
    el('table', { class: 'card-table' },
      head.some(Boolean) ? el('thead', {}, el('tr', {}, head.map((text, i) => cell('th', text, i)))) : null,
      el('tbody', {}, rows.map((row) => el('tr', {}, row.map((text, i) => cell('td', text, i)))))));
}

/* Text with its tables, its line breaks and its LaTeX drawn, as nodes for
   el(). */
export function richText(text) {
  return blocks(text).flatMap((block) => (block.table ? table(block.table) : inline(block.text)));
}
