/* Settings and the shortcut sheet. */

import { el, icon, toast } from '../dom.js';
import { t, getLocale } from '../i18n/index.js';
import * as store from '../store.js';
import { THEMES, getTheme, setTheme, onThemeChange } from '../theme.js';
import { onCleanup } from '../router.js';
import { chooseLanguage, fillLanguageSelect } from '../language.js';

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

  /* The id brings the focus back here when a language change rebuilds the page. */
  const localeSelect = el('select', { class: 'select', id: 'settings-locale' });
  fillLanguageSelect(localeSelect);
  localeSelect.addEventListener('change', () => chooseLanguage(localeSelect.value));

  const themeSelect = el('select', { class: 'select' },
    THEMES.map((theme) => el('option', { value: theme }, t('theme.' + theme))));
  themeSelect.value = getTheme();
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));
  /* The top bar toggle, or another tab, may change the theme meanwhile. */
  onCleanup(onThemeChange((theme) => { themeSelect.value = theme; }));

  const goal = el('input', {
    type: 'number', class: 'input', step: '1',
    min: String(store.GOAL_RANGE.min), max: String(store.GOAL_RANGE.max),
    value: String(settings.goal),
    onchange: () => {
      /* The store rounds and bounds it, and keeps the old goal for an empty field. */
      const typed = goal.value.trim();
      goal.value = String(store.setSetting('goal', typed ? Number(typed) : NaN));
      toast(t('settings.saved'));
    },
  });
  /* The router focuses the page once it is mounted, so wait for that, and
     only take the focus from the page itself: when the same page is rebuilt,
     the learner may be on another control, such as the language menu. */
  if (focus === 'goal') {
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active && active.contains(goal)) goal.focus();
    });
  }

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

export function shortcutsView() {
  /* Keys with a name are named in the interface language. */
  const space = t('key.space');
  const enter = t('key.enter');
  const shortcuts = [
    ['shortcuts.flip', [space, enter]],
    ['shortcuts.nav', ['←', '→']],
    ['shortcuts.answer', ['1', '2', '3', '4']],
    ['shortcuts.submit', [enter]],
    ['shortcuts.speak', ['A']],
    ['shortcuts.star', ['S']],
  ];
  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('shortcuts.title')),
    el('p', { class: 'lede' }, t('shortcuts.lede')),
    el('section', { class: 'panel' },
      el('div', { class: 'kbd-list' },
        shortcuts.map(([key, keys]) => el('div', { class: 'kbd-row' },
          el('span', {}, t(key)),
          el('span', { class: 'row', style: { gap: '4px' } }, keys.map((label) => el('kbd', {}, label))))))),
    el('p', {}, el('a', { class: 'btn', href: '#/' }, t('error.goHome'))));
}
