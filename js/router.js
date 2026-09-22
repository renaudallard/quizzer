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

  mount(outlet, view);
  outlet.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  for (const fn of afterRender) fn(path);
}

export function start(node) {
  outlet = node;
  window.addEventListener('hashchange', render);
  render();
}
