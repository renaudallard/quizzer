/* Hash routing. Patterns are matched against the path with the leading "#/"
   removed, and capture groups are handed to the handler in order. */

import { mount } from './dom.js';
import { resetTooltip } from './chart.js';

const routes = [];
const afterRender = new Set();
let cleanups = [];
let outlet = null;
let fallback = () => null;

export function register(pattern, handler) {
  routes.push([pattern, handler]);
}

export function setFallback(handler) {
  fallback = handler;
}

export function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '');
  try {
    return decodeURI(raw);
  } catch {
    /* A stray percent sign is not a reason to blank the page. */
    return raw;
  }
}

export function navigate(path, { replace = false } = {}) {
  const target = '#/' + String(path).replace(/^\/+/, '');
  if (replace) location.replace(target);
  else location.hash = target;
}

/* Registered by a view that attaches something outside its own subtree, such
   as a document key handler, so leaving the route takes it back down. */
export function onCleanup(fn) {
  cleanups.push(fn);
}

/* A view holding work that rebuilding it would throw away, such as a draft
   or a round in progress, says so here. Rebuilds the learner did not ask
   for, like a language change, then leave the page alone. */
let busy = null;

export function setBusy(fn) {
  busy = fn;
  onCleanup(() => { if (busy === fn) busy = null; });
}

export function isBusy() {
  return Boolean(busy && busy());
}

export function onAfterRender(fn) {
  afterRender.add(fn);
  return () => afterRender.delete(fn);
}

/* Takes down what the current view attached outside its own subtree. The
   test page calls it too, since it builds views without routing to them. */
export function teardown() {
  for (const fn of cleanups) fn();
  cleanups = [];
  resetTooltip();
}

let shownPath = null;

export function render() {
  teardown();

  const path = currentPath();
  let view = null;
  for (const [pattern, handler] of routes) {
    const match = pattern.exec(path);
    if (match) {
      view = handler(...match.slice(1));
      break;
    }
  }
  if (view === null || view === undefined) view = fallback(path);

  /* A new page takes the focus and starts at the top. The same page built
     again, after a language change or another tab's save, leaves the reader
     where they were: the scroll stays, a control outside the page keeps the
     focus, and one inside it gets the focus back through its id. */
  const active = document.activeElement;
  const hadFocus = Boolean(active && outlet.contains(active));
  const focusedId = hadFocus ? active.id : '';
  const arrived = path !== shownPath;
  shownPath = path;
  mount(outlet, view);
  if (arrived) {
    outlet.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } else if (hadFocus) {
    const again = focusedId ? document.getElementById(focusedId) : null;
    (again || outlet).focus({ preventScroll: true });
  }
  for (const fn of afterRender) fn(path);
}

export function start(node) {
  outlet = node;
  window.addEventListener('hashchange', render);
  render();
}
