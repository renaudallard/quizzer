/* Translation engine. French is the default and the reference catalogue: any
   key missing from another language falls back to the French string. */

import fr from './fr.js';
import en from './en.js';
import nl from './nl.js';

export const DEFAULT_LOCALE = 'fr';

export const LOCALES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
];

/* Exported so the test page can hold every catalogue against the French one. */
export const CATALOGS = { fr, en, nl };

let current = DEFAULT_LOCALE;
let plurals = new Intl.PluralRules(current);
const listeners = new Set();

export function getLocale() {
  return current;
}

export function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(CATALOGS, code);
}

export function setLocale(code) {
  const next = isSupported(code) ? code : DEFAULT_LOCALE;
  if (next === current) return current;
  current = next;
  plurals = new Intl.PluralRules(current);
  document.documentElement.lang = current;
  applyStatic();
  for (const fn of listeners) fn(current);
  return current;
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Keys asked for but found in no catalogue. Such a key reaches the screen
   raw, so the test page reads this set to catch a typo or a missing string. */
export const missingKeys = new Set();

function lookup(key) {
  const value = CATALOGS[current][key] ?? CATALOGS[DEFAULT_LOCALE][key];
  if (value !== undefined) return value;
  missingKeys.add(key);
  return key;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
}

export function t(key, vars) {
  return interpolate(lookup(key), vars);
}

/* Plural aware lookup: tries key.one, key.other and so on following the
   language rules, so French keeps zero in the singular form. */
export function tn(key, count, vars) {
  const form = plurals.select(count);
  let value = CATALOGS[current][key + '.' + form]
    ?? CATALOGS[current][key + '.other']
    ?? CATALOGS[DEFAULT_LOCALE][key + '.' + form]
    ?? CATALOGS[DEFAULT_LOCALE][key + '.other'];
  if (value === undefined) {
    missingKeys.add(key);
    value = key;
  }
  return interpolate(value, { n: formatNumber(count), ...vars });
}

/* Building an Intl formatter costs far more than using one, and a page
   formats dozens of numbers and dates, so each kind is built once per
   language and kept. */
const formatters = new Map();

function formatter(kind, make) {
  const key = current + ' ' + kind;
  let made = formatters.get(key);
  if (!made) {
    made = make(current);
    formatters.set(key, made);
  }
  return made;
}

export function formatNumber(value) {
  return formatter('number', (locale) => new Intl.NumberFormat(locale)).format(value);
}

export function formatPercent(value) {
  return formatter('percent', (locale) => new Intl.NumberFormat(locale, {
    style: 'percent', maximumFractionDigits: 0,
  })).format(value / 100);
}

export function formatDate(ts, style = 'medium') {
  return formatter('date ' + style, (locale) => new Intl.DateTimeFormat(locale, { dateStyle: style }))
    .format(new Date(ts));
}

export function formatDayShort(ts) {
  return formatter('day', (locale) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }))
    .format(new Date(ts));
}

/* A stored YYYY-MM-DD day, read as local midnight, as a short date. */
export function formatDayKey(key) {
  return formatDayShort(new Date(key + 'T00:00:00'));
}

export function formatRelativeDays(days) {
  return formatter('relative', (locale) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }))
    .format(days, 'day');
}

const ATTRS = {
  'data-i18n-aria-label': 'aria-label',
  'data-i18n-title': 'title',
  'data-i18n-placeholder': 'placeholder',
};

/* Translates markup written directly in index.html, which ships in French so
   the first paint is already correct with no script running. */
export function applyStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const [dataAttr, target] of Object.entries(ATTRS)) {
    for (const node of root.querySelectorAll('[' + dataAttr + ']')) {
      node.setAttribute(target, t(node.getAttribute(dataAttr)));
    }
  }
}
