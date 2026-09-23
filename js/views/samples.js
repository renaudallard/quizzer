/* The sample sets by group: the learner ticks what to add. Only the sets not
   already there are added, so a group can be loaded again once the site ships
   more of it, and a deleted set comes back from here. */

import { el, icon, mount } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { navigate, currentPath } from '../router.js';
import { toastSaved } from './shared.js';

/* The groups in file order, each with its sets. A set that names no known
   group goes into a last one rather than out of sight. */
function groupsOf(payload) {
  const groups = (Array.isArray(payload.groups) ? payload.groups : [])
    .filter((group) => group && typeof group.id === 'string' && group.id)
    .map((group) => ({ id: group.id, title: String(group.title || group.id), description: String(group.description || ''), sets: [] }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  const other = { id: '', title: t('samples.other'), description: '', sets: [] };
  for (const set of payload.sets) (byId.get(set.group) || other).sets.push(set);
  return groups.concat(other).filter((group) => group.sets.length);
}

function chooser(groups) {
  const known = new Set(store.getSets().map((set) => set.id));
  const rows = groups.map((group) => {
    const missing = group.sets.filter((set) => !known.has(set.id));
    const have = group.sets.length - missing.length;
    const cards = group.sets.reduce((sum, set) => sum + (Array.isArray(set.cards) ? set.cards.length : 0), 0);
    const box = el('input', { type: 'checkbox', disabled: !missing.length });
    const node = el('label', { class: 'checkbox' }, box,
      el('span', { class: 'checkbox-text' },
        el('strong', {}, group.title),
        group.description ? el('small', {}, group.description) : null,
        el('small', {}, tn('count.sets', group.sets.length), ' · ', tn('count.cards', cards),
          have ? ' · ' + (missing.length ? tn('samples.someLoaded', have) : t('samples.allLoaded')) : null)));
    return { missing, box, node };
  });

  const warning = el('p', { class: 'field-hint', hidden: true }, t('samples.none'));
  const add = el('button', { type: 'button', class: 'btn btn-primary' }, icon('plus'), t('samples.add'));
  add.addEventListener('click', () => {
    const chosen = rows.filter((row) => row.box.checked).flatMap((row) => row.missing);
    if (!chosen.length) {
      warning.hidden = false;
      return;
    }
    toastSaved(tn('samples.loaded', store.importPayload(chosen)));
    if (currentPath() === 'samples') navigate('');
  });

  const complete = rows.every((row) => !row.missing.length);
  return el('div', { class: 'stack' },
    complete ? el('p', {}, t('samples.already')) : null,
    el('section', { class: 'panel stack' }, rows.map((row) => row.node)),
    warning,
    el('div', { class: 'row' },
      complete ? null : add,
      el('a', { class: 'btn', href: '#/' }, t('common.back'))));
}

/* Asked of the server every time: the list grows as sample sets are added,
   and a copy the browser kept would hide the new ones. The answer may come
   after the learner has left, which only fills a page no longer shown. */
async function fill(body) {
  let payload;
  try {
    const response = await fetch('data/samples.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    payload = await response.json();
    if (!payload || !Array.isArray(payload.sets)) throw new Error('shape');
  } catch {
    body.removeAttribute('aria-busy');
    mount(body,
      el('p', {}, t('samples.failed')),
      el('div', { class: 'row' }, el('a', { class: 'btn', href: '#/' }, t('common.back'))));
    return;
  }
  body.removeAttribute('aria-busy');
  mount(body, chooser(groupsOf(payload)));
}

export function samplesView() {
  const body = el('div', { 'aria-busy': 'true' }, el('p', { class: 'chart-sub' }, t('samples.loading')));
  fill(body);
  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('samples.title')),
    el('p', { class: 'lede' }, t('samples.lede')),
    body);
}
