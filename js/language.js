/* Language choice, shared by the top bar and the settings page so the two
   never drift apart, as theme.js does for the theme. */

import { el, mount } from './dom.js';
import { LOCALES, DEFAULT_LOCALE, isSupported, getLocale, setLocale } from './i18n/index.js';
import * as store from './store.js';

/* French unless the learner has picked something else. */
export function savedLanguage() {
  const saved = store.getSettings().locale;
  return saved && isSupported(saved) ? saved : DEFAULT_LOCALE;
}

export function chooseLanguage(code) {
  store.setSetting('locale', code);
  setLocale(code);
}

export function fillLanguageSelect(select) {
  mount(select, LOCALES.map((locale) => el('option', { value: locale.code }, locale.label)));
  select.value = getLocale();
}
