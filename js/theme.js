/* Theme choice, shared by the top bar toggle and the settings page so the two
   never drift apart. */

import * as store from './store.js';

export const THEMES = ['system', 'light', 'dark'];

const listeners = new Set();

function apply(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}

export function getTheme() {
  const saved = store.getSettings().theme;
  return THEMES.includes(saved) ? saved : 'system';
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'system';
  store.setSetting('theme', next);
  apply(next);
  for (const fn of listeners) fn(next);
  return next;
}

export function cycleTheme() {
  return setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme() {
  apply(getTheme());
}
