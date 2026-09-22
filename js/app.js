/* Bootstrap: restore the saved state, settle the language and theme, then hand
   the page over to the router. */

import { el, icon, mount } from './dom.js';
import { t, setLocale, applyStatic, onLocaleChange, LOCALES, DEFAULT_LOCALE, isSupported } from './i18n/index.js';
import * as store from './store.js';
import * as router from './router.js';
import { initTheme, getTheme, cycleTheme, onThemeChange } from './theme.js';

import { homeView } from './views/home.js';
import { setView } from './views/set.js';
import { editorView } from './views/editor.js';
import { statsView } from './views/stats.js';
import { settingsView, shortcutsView } from './views/settings.js';
import { transferView, sharedView } from './views/transfer.js';
import { notFoundPanel } from './views/shared.js';
import { flashcardsView } from './modes/flashcards.js';
import { reviewView } from './modes/review.js';
import { quizView } from './modes/quiz.js';
import { writeView } from './modes/write.js';
import { matchView } from './modes/match.js';

const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };

function paintThemeButton(button) {
  const theme = getTheme();
  mount(button, icon(THEME_ICONS[theme]));
  const label = t('theme.toggle', { mode: t('theme.' + theme) });
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

function setupTheme() {
  const button = document.getElementById('theme-toggle');
  initTheme();
  paintThemeButton(button);
  button.addEventListener('click', cycleTheme);
  onThemeChange(() => paintThemeButton(button));
  onLocaleChange(() => paintThemeButton(button));
}

function setupLocale() {
  const select = document.getElementById('locale-select');
  const saved = store.getSettings().locale;
  /* French unless the reader has picked something else. */
  const initial = saved && isSupported(saved) ? saved : DEFAULT_LOCALE;

  mount(select, LOCALES.map((locale) => el('option', { value: locale.code }, locale.label)));
  select.value = initial;
  document.documentElement.lang = initial;
  setLocale(initial);
  applyStatic();

  select.addEventListener('change', () => {
    store.setSetting('locale', select.value);
    setLocale(select.value);
  });
  onLocaleChange((code) => { select.value = code; });
}

/* While changes cannot be written the alert stays up, and leaving the page
   asks first, since whatever is only in memory would be lost. */
function setupSaveAlert() {
  const alert = document.getElementById('save-alert');
  const show = (failing) => { alert.hidden = !failing; };
  show(store.unsaved());
  store.onUnsavedChange(show);
  window.addEventListener('beforeunload', (event) => {
    if (!store.unsaved()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function highlightNav(path) {
  const root = '/' + path.split('/')[0];
  for (const link of document.querySelectorAll('.topnav a')) {
    if (link.dataset.nav === root) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function setRoutes() {
  const modes = {
    cards: flashcardsView,
    review: reviewView,
    quiz: quizView,
    write: writeView,
    match: matchView,
    stats: statsView,
    edit: editorView,
  };

  router.register(/^$/, () => homeView());
  router.register(/^new$/, () => editorView(null));
  router.register(/^transfer$/, () => transferView());
  router.register(/^settings(?:\/(goal))?$/, (focus) => settingsView(focus));
  router.register(/^shortcuts$/, () => shortcutsView());
  router.register(/^shared\/(.+)$/, (payload) => sharedView(payload));
  router.register(/^set\/([^/]+)\/([a-z]+)$/, (id, mode) => (
    modes[mode] ? modes[mode](id) : null
  ));
  router.register(/^set\/([^/]+)$/, (id) => setView(id));
  router.setFallback(() => notFoundPanel(t('error.notFoundBody')));
}

function main() {
  store.load();
  setupLocale();
  setupSaveAlert();
  setupTheme();
  setRoutes();
  router.onAfterRender(highlightNav);
  onLocaleChange(() => router.render());
  router.start(document.getElementById('main'));
}

main();
