/* LaTeX on cards, drawn by KaTeX. KaTeX is fetched from vendor/katex the
   first time a card holds some, and until it is there, or if it cannot be
   loaded, each formula shows written on one line. */

import { segments, plain } from './text.js';

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

/* Text with its LaTeX drawn, as nodes for el(). */
export function richText(text) {
  return segments(text).map((part) => {
    if (part.tex === undefined) return part.text;
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
