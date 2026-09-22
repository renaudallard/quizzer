/* Settings and the shortcut sheet. */

import { el, icon, toast } from '../dom.js';
import { t, getLocale, setLocale, LOCALES } from '../i18n/index.js';
import * as store from '../store.js';
import { THEMES, getTheme, setTheme } from '../theme.js';

function formatBytes(bytes) {
  const kilobytes = bytes / 1024;
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'unit', unit: 'kilobyte', maximumFractionDigits: 1,
    }).format(kilobytes);
  } catch {
    return kilobytes.toFixed(1) + ' kB';
  }
}

function switchRow(key, hintKey, checked, onChange) {
  const box = el('input', { type: 'checkbox', checked, onchange: () => onChange(box.checked) });
  return el('label', { class: 'checkbox' }, box,
    el('span', { class: 'checkbox-text' },
      el('span', {}, t(key)),
      el('small', {}, t(hintKey))));
}

/* focus names a field to land on, as the daily goal tile does with "goal". */
export function settingsView(focus) {
  const settings = store.getSettings();

  const localeSelect = el('select', { class: 'select' },
    LOCALES.map((locale) => el('option', { value: locale.code }, locale.label)));
  localeSelect.value = getLocale();
  localeSelect.addEventListener('change', () => {
    store.setSetting('locale', localeSelect.value);
    setLocale(localeSelect.value);
  });

  const themeSelect = el('select', { class: 'select' },
    THEMES.map((theme) => el('option', { value: theme }, t('theme.' + theme))));
  themeSelect.value = getTheme();
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

  const goal = el('input', {
    type: 'number', class: 'input', min: '5', max: '200', step: '5',
    value: String(settings.goal),
    onchange: () => {
      const value = Math.min(200, Math.max(5, Number(goal.value) || 20));
      goal.value = String(value);
      store.setSetting('goal', value);
      toast(t('settings.saved'));
    },
  });
  /* The router focuses the page once it is mounted, so wait for that. */
  if (focus === 'goal') queueMicrotask(() => goal.focus());

  const reset = el('button', { type: 'button', class: 'btn btn-danger' }, icon('trash'), t('settings.reset'));
  reset.addEventListener('click', () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    store.resetAll();
    location.hash = '#/';
    location.reload();
  });

  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('settings.title')),

    el('section', { class: 'panel stack' },
      el('h2', {}, t('settings.appearance')),
      el('label', { class: 'field' }, el('span', {}, t('settings.language')), localeSelect),
      el('label', { class: 'field' }, el('span', {}, t('settings.theme')), themeSelect)),

    el('section', { class: 'panel stack' },
      el('h2', {}, t('settings.learning')),
      switchRow('settings.accents', 'settings.accentsHint', settings.accents, (value) => {
        store.setSetting('accents', value);
        toast(t('settings.saved'));
      }),
      switchRow('settings.typos', 'settings.typosHint', settings.typos, (value) => {
        store.setSetting('typos', value);
        toast(t('settings.saved'));
      }),
      switchRow('settings.speech', 'settings.speechHint', settings.speech, (value) => {
        store.setSetting('speech', value);
        toast(t('settings.saved'));
      }),
      el('label', { class: 'field' },
        el('span', {}, t('settings.goal')),
        goal,
        el('span', { class: 'field-hint' }, t('settings.goalHint')))),

    el('section', { class: 'panel stack' },
      el('h2', {}, t('settings.data')),
      el('p', { class: 'field-hint' }, t('settings.storageUsed', { size: formatBytes(store.storageBytes()) })),
      el('div', { class: 'row' },
        el('a', { class: 'btn', href: '#/transfer' }, icon('download'), t('transfer.title')),
        reset)));
}

const SHORTCUTS = [
  ['shortcuts.flip', ['Espace', 'Enter']],
  ['shortcuts.nav', ['←', '→']],
  ['shortcuts.answer', ['1', '2', '3', '4']],
  ['shortcuts.submit', ['Enter']],
  ['shortcuts.speak', ['A']],
  ['shortcuts.star', ['S']],
];

export function shortcutsView() {
  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('shortcuts.title')),
    el('p', { class: 'lede' }, t('shortcuts.lede')),
    el('section', { class: 'panel' },
      el('div', { class: 'kbd-list' },
        SHORTCUTS.map(([key, keys]) => el('div', { class: 'kbd-row' },
          el('span', {}, t(key)),
          el('span', { class: 'row', style: { gap: '4px' } }, keys.map((label) => el('kbd', {}, label))))))),
    el('p', {}, el('a', { class: 'btn', href: '#/' }, t('error.goHome'))));
}
