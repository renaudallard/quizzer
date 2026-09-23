/* Dashboard: what is due right now, how the last two weeks went, and the sets
   themselves. */

import { el, icon, toast, mount } from '../dom.js';
import { t, tn, formatDayKey, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, masteryPct } from '../srs.js';
import { statTile, meter, activityChart, figure } from '../chart.js';
import { truncate } from '../text.js';
import { toastSaved } from './shared.js';
import { render, currentPath } from '../router.js';

async function loadSamples(button) {
  button.disabled = true;
  try {
    const response = await fetch('data/samples.json');
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    const known = new Set(store.getSets().map((set) => set.id));
    const fresh = payload.sets.filter((set) => !known.has(set.id));
    if (!fresh.length) {
      toast(t('samples.already'));
      return;
    }
    const count = store.importPayload({ sets: fresh });
    toastSaved(tn('samples.loaded', count));
    /* The download may finish after the learner has moved on; only the home
       page is rebuilt, never whatever they are now doing. */
    if (currentPath() === '') render();
  } catch {
    toast(t('samples.failed'));
  } finally {
    button.disabled = false;
  }
}

function setCard(set) {
  const due = dueCards(set.cards).length;
  const mastery = masteryPct(set.cards);
  return el('a', { class: 'set-card', href: '#/set/' + set.id },
    el('h3', {}, set.title),
    set.description ? el('p', {}, truncate(set.description, 90)) : null,
    meter(mastery),
    el('div', { class: 'set-card-meta' },
      el('span', { class: 'chip' }, tn('count.cards', set.cards.length)),
      due ? el('span', { class: 'chip chip-due' }, tn('set.dueNow', due)) : null,
      el('span', { class: 'chip' }, t('set.progress', { p: formatPercent(mastery) }))));
}

function setsSection(sets) {
  const grid = el('div', { class: 'set-grid' }, sets.map(setCard));
  const notice = el('p', { class: 'chart-sub', hidden: true }, t('home.noMatch'));

  const search = el('input', {
    type: 'search', class: 'input', placeholder: t('home.searchPlaceholder'),
    'aria-label': t('home.searchPlaceholder'),
    oninput: () => {
      const needle = search.value.trim().toLowerCase();
      const matches = needle
        ? sets.filter((set) => (set.title + ' ' + set.description).toLowerCase().includes(needle))
        : sets;
      mount(grid, matches.map(setCard));
      notice.hidden = matches.length > 0;
    },
  });

  /* The samples stay on offer once sets exist: only the missing ones are
     added, so sample sets shipped later can still be loaded. */
  return el('section', {},
    el('div', { class: 'row-between', style: { marginBottom: '14px' } },
      el('h2', {}, t('home.sets')),
      el('div', { class: 'row' },
        samplesButton(),
        el('a', { class: 'btn', href: '#/new' }, icon('plus'), t('home.cta.create')))),
    sets.length > 4 ? el('div', { class: 'search-bar' }, search) : null,
    notice,
    grid);
}

function samplesButton() {
  const button = el('button', { type: 'button', class: 'btn' }, icon('book'), t('home.cta.samples'));
  button.addEventListener('click', () => loadSamples(button));
  return button;
}

function emptyState() {
  return el('div', { class: 'empty' },
    el('h2', {}, t('home.empty.title')),
    el('p', {}, t('home.empty.body')),
    el('div', { class: 'empty-actions' },
      el('a', { class: 'btn btn-primary', href: '#/new' }, icon('plus'), t('home.cta.create')),
      samplesButton()));
}

export function homeView() {
  const sets = store.getSets();
  const summary = store.summary();
  const settings = store.getSettings();

  /* Sends the learner where the backlog actually is. */
  const busiest = sets
    .map((set) => ({ set, due: dueCards(set.cards).length }))
    .sort((a, b) => b.due - a.due)[0];

  /* With no set yet the empty state below carries the actions, so the hero
     does not offer them a second time. */
  const actions = [];
  if (busiest && busiest.due) {
    actions.push(el('a', { class: 'btn btn-primary btn-lg', href: '#/set/' + busiest.set.id + '/review' },
      icon('repeat'), t('home.cta.review')));
    actions.push(el('a', { class: 'btn btn-lg', href: '#/new' }, icon('plus'), t('home.cta.create')));
  } else if (sets.length) {
    actions.push(el('a', { class: 'btn btn-primary btn-lg', href: '#/new' }, icon('plus'), t('home.cta.create')));
    actions.push(el('a', { class: 'btn btn-lg', href: '#/transfer' }, icon('upload'), t('transfer.title')));
  }

  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero-text' },
      el('h1', {}, t('home.title')),
      el('p', { class: 'lede' }, t('home.lede')),
      actions.length ? el('div', { class: 'hero-actions' }, actions) : null));

  const tiles = el('section', { class: 'kpi-row' },
    statTile({ label: t('stat.due'), value: summary.due, sub: t('stat.dueSub') }),
    statTile({ label: t('stat.cards'), value: summary.cards, sub: tn('count.sets', summary.sets) }),
    statTile({
      label: t('stat.accuracy'),
      value: summary.accuracy === null ? '–' : formatPercent(summary.accuracy),
      sub: t('stat.accuracySub'),
    }),
    statTile({ label: t('stat.streak'), value: summary.streak, sub: tn('stat.streakSub', summary.streak) }),
    /* Past the goal the fraction stops at the goal and the caption gives the
       real count. The goal is at least 5, so that count is always plural. */
    statTile({
      label: [t('stat.goal'), icon('edit')],
      value: Math.min(summary.today, settings.goal) + '/' + settings.goal,
      sub: summary.today >= settings.goal ? t('stat.goalDone', { n: summary.today }) : t('stat.goalSub'),
      href: '#/settings/goal',
      title: t('stat.goalEdit'),
    }));

  const points = store.activityFor(14).map((entry) => ({ ...entry, label: formatDayKey(entry.key) }));
  const activity = el('section', { class: 'panel', style: { marginBottom: '26px' } },
    figure({ title: t('home.activity.title'), sub: t('home.activity.sub') },
      activityChart(points, { label: (vars) => tn('count.cards', vars.n) })));

  return el('div', { class: 'container' },
    hero,
    sets.length ? tiles : null,
    sets.length ? activity : null,
    sets.length ? setsSection(sets) : emptyState());
}
