/* Getting cards in and out: delimited text, file downloads and share links. */

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
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'quizzer';
}

function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((row) => row.trim() && !row.startsWith('#')) || '';
  for (const candidate of ['\t', ';', ',']) {
    if (line.includes(candidate)) return candidate;
  }
  return '\t';
}

/* Quote aware reader, so a definition may legitimately hold the delimiter as
   long as the field is quoted the way spreadsheets write it. */
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
    if (char === QUOTE && field === '') { quoted = true; continue; }
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
  const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return HEADER_TERMS.has(norm(cells[0])) && HEADER_DEFS.has(norm(cells[1]));
}

/* Spreadsheets do not always write UTF-8: Excel on Windows still saves CSV in
   its legacy code page, so read that rather than show mangled accents. */
export async function readText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseDelimited(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter).filter((cells) => !cells[0].trim().startsWith('#'));
  if (rows.length && looksLikeHeader(rows[0])) rows.shift();
  return rows
    .map((cells) => ({
      term: (cells[0] || '').trim(),
      def: (cells[1] || '').trim(),
      hint: (cells[2] || '').trim(),
    }))
    .filter((card) => card.term && card.def);
}

function csvField(value) {
  const text = String(value ?? '');
  return /["\n\r,]/.test(text) ? QUOTE + text.replace(/"/g, '""') + QUOTE : text;
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
