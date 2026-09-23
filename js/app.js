/* Bootstrap: restore the saved state, settle the language and theme, then hand
   the page over to the router. */

import { icon, mount } from './dom.js';
import { t, setLocale, getLocale, applyStatic, onLocaleChange } from './i18n/index.js';
import * as store from './store.js';
import * as router from './router.js';
import { initTheme, getTheme, cycleTheme, onThemeChange } from './theme.js';
import { savedLanguage, chooseLanguage, fillLanguageSelect } from './language.js';
import { pruneImages } from './images.js';

import { homeView } from './views/home.js';
import { setView } from './views/set.js';
import { editorView } from './views/editor.js';
import { statsView } from './views/stats.js';
import { settingsView, shortcutsView } from './views/settings.js';
import { transferView, sharedView } from './views/transfer.js';
import { notFoundPanel } from './views/shared.js';
import { flashcardsView } from './modes/flashcards.js';
import { reviewView } from './modes/review.js';
import { learnView } from './modes/learn.js';
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
  const initial = savedLanguage();
  document.documentElement.lang = initial;
  setLocale(initial);
  fillLanguageSelect(select);
  applyStatic();

  select.addEventListener('change', () => chooseLanguage(select.value));
  onLocaleChange((code) => { select.value = code; });
}

/* Following the skip link would change the hash, which the router reads as
   a route, so the link moves the focus itself. */
function setupSkipLink() {
  const main = document.getElementById('main');
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
  });
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

/* Another tab has written the store. Taking its data now means a save from
   this tab cannot put an older copy back. The page is rebuilt to show it,
   unless it holds a draft or a round, whose own saves go by id. A tab that
   could not save keeps what it holds instead, alert included, since loading
   would throw its changes away. */
function followOtherTabs() {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== store.STORAGE_KEY) return;
    if (store.unsaved()) return;
    store.load();
    initTheme();
    const before = getLocale();
    setLocale(savedLanguage());
    if (getLocale() === before && !router.isBusy()) router.render();
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
    learn: learnView,
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
  /* Own keys only: a plain object also answers to "constructor". */
  router.register(/^set\/([^/]+)\/([a-z]+)$/, (id, mode) => (
    Object.prototype.hasOwnProperty.call(modes, mode) ? modes[mode](id) : null
  ));
  router.register(/^set\/([^/]+)$/, (id) => setView(id));
  router.setFallback(() => notFoundPanel(t('error.notFoundBody')));
}

function main() {
  store.load();
  /* Only with the cards in hand: an empty state after a failed load would
     otherwise look like pictures nobody uses. */
  if (!store.unsaved() && !store.hasSalvage()) pruneImages(store.imageIds()).catch(() => {});
  setupLocale();
  setupSaveAlert();
  setupSkipLink();
  setupTheme();
  setRoutes();
  router.onAfterRender(highlightNav);
  followOtherTabs();
  /* A page holding a draft or a round keeps its language until the learner
     moves on; the top bar and everything built from then on switch at once. */
  onLocaleChange(() => { if (!router.isBusy()) router.render(); });
  router.start(document.getElementById('main'));
}

main();
