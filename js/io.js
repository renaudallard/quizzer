/* Getting cards in and out: delimited text, file downloads and share links. */

import { normalize } from './text.js';

const QUOTE = '"';

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(name) {
  return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'quizzer';
}

const DELIMITERS = ['\t', ';', ','];

/* The separator is the one of tab, semicolon and comma found on the most
   lines that hold data, tab first, then semicolon, then comma on a tie. A
   definition that lists alternatives with ";" in a comma file then does not
   decide for the whole file. Quotes are read the way the parser reads them,
   a quote opening a field after any of the three, so a quoted comma or
   semicolon cannot mislead it. Whitespace is passed over the same way too:
   a line of spaces or tabs holds no data, and a "#" after any whitespace
   starts a comment line. */
function detectDelimiter(text) {
  const lines = new Map(DELIMITERS.map((candidate) => [candidate, 0]));
  let i = 0;
  while (i < text.length) {
    const found = new Set();
    let quoted = false;
    let fieldStart = true;
    let data = false;
    let comment = false;
    for (; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === QUOTE) {
          if (text[i + 1] === QUOTE) i++;
          else quoted = false;
        }
        continue;
      }
      if (char === '\n') { i++; break; }
      if (comment || char === '\r') continue;
      if (/\s/.test(char)) {
        if (char === '\t') { found.add(char); fieldStart = true; }
        continue;
      }
      if (!data && char === '#') { comment = true; continue; }
      data = true;
      if (DELIMITERS.includes(char)) { found.add(char); fieldStart = true; continue; }
      if (char === QUOTE && fieldStart) quoted = true;
      fieldStart = false;
    }
    if (data) for (const candidate of found) lines.set(candidate, lines.get(candidate) + 1);
  }
  let best = DELIMITERS[0];
  for (const candidate of DELIMITERS) if (lines.get(candidate) > lines.get(best)) best = candidate;
  return best;
}

/* Quote aware reader, so a definition may legitimately hold the delimiter as
   long as the field is quoted the way spreadsheets write it. A line whose
   first character, spaces aside, is an unquoted "#" is a comment. */
function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === QUOTE) {
        if (text[i + 1] === QUOTE) { field += QUOTE; i++; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === QUOTE && !field.trim()) { field = ''; quoted = true; continue; }
    if (char === '#' && !row.length && !field.trim()) {
      while (i < text.length && text[i] !== '\n') i++;
      field = '';
      continue;
    }
    if (char === delimiter) { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (char === '\r') continue;
    field += char;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const HEADER_TERMS = new Set(['term', 'terme', 'front', 'recto', 'question', 'word', 'mot',
  'begrip', 'vraag', 'woord', 'voorkant']);
const HEADER_DEFS = new Set(['definition', 'back', 'verso', 'answer', 'reponse', 'translation', 'traduction', 'sens',
  'definitie', 'antwoord', 'vertaling', 'betekenis', 'achterkant']);

function looksLikeHeader(cells) {
  return HEADER_TERMS.has(normalize(cells[0] || '')) && HEADER_DEFS.has(normalize(cells[1] || ''));
}

/* Spreadsheets do not always write UTF-8. A byte order mark announces UTF-16,
   as in Excel's "Unicode Text" export, and Excel on Windows still saves CSV
   in its legacy code page, so read that rather than show mangled accents. */
export async function readText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseDelimited(text) {
  const rows = parseRows(text, detectDelimiter(text));
  if (rows.length && looksLikeHeader(rows[0])) rows.shift();
  return rows
    .map((cells) => ({
      term: (cells[0] || '').trim(),
      def: (cells[1] || '').trim(),
      hint: (cells[2] || '').trim(),
    }))
    .filter((card) => card.term && card.def);
}

/* Quoted when it holds a separator or a line break, or when it starts with
   "#", which would otherwise read back as a comment. */
function csvField(value) {
  const text = String(value ?? '');
  return /["\n\r,;\t]|^\s*#/.test(text) ? QUOTE + text.replace(/"/g, '""') + QUOTE : text;
}

export function toCSV(set) {
  const lines = [['term', 'definition', 'hint'].join(',')];
  for (const card of set.cards) {
    lines.push([card.term, card.def, card.hint].map(csvField).join(','));
  }
  return lines.join('\n') + '\n';
}

/* Share links carry the cards themselves, base64url encoded in the fragment,
   so nothing ever reaches a server. Progress is deliberately left behind. */
function base64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(payload) {
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(set) {
  const compact = {
    t: set.title,
    d: set.description || undefined,
    tl: set.termLang || undefined,
    dl: set.defLang || undefined,
    c: set.cards.map((card) => (card.hint ? [card.term, card.def, card.hint] : [card.term, card.def])),
  };
  return base64urlEncode(JSON.stringify(compact));
}

export function decodeShare(payload) {
  try {
    const data = JSON.parse(base64urlDecode(payload));
    if (!data || typeof data.t !== 'string' || !Array.isArray(data.c)) return null;
    const cards = data.c
      .filter((entry) => Array.isArray(entry) && entry.length >= 2)
      .map((entry) => ({ term: String(entry[0]), def: String(entry[1]), hint: entry[2] ? String(entry[2]) : '' }));
    if (!cards.length) return null;
    return {
      title: data.t,
      description: typeof data.d === 'string' ? data.d : '',
      termLang: typeof data.tl === 'string' ? data.tl : '',
      defLang: typeof data.dl === 'string' ? data.dl : '',
      cards,
    };
  } catch {
    return null;
  }
}

export function shareUrl(set) {
  return location.origin + location.pathname + '#/shared/' + encodeShare(set);
}

/* The clipboard API needs a secure context, which a plain http server on the
   local network is not, so fall back before giving up. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
