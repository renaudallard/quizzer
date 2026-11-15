/* Dashboard: what is due right now, how the last two weeks went, and the sets
   themselves. */

import { el, icon, mount } from '../dom.js';
import { t, tn, formatDayKey, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, masteryPct } from '../srs.js';
import { statTile, meter, activityChart, figure } from '../chart.js';
import { truncate } from '../text.js';
import { foldersByName, toastSaved } from './shared.js';

function setCard(set) {
  const due = dueCards(set.cards).length;
  const mastery = masteryPct(set.cards);
  return el('a', { class: 'set-card', href: '#/set/' + set.id },
    el('h3', {}, set.title),
    set.description ? el('p', {}, truncate(set.description, 90)) : null,
    meter(mastery),
    el('div', { class: 'set-card-meta' },
      el('span', { class: 'chip' }, tn('count.cards', set.cards.length)),
      set.diagrams.length ? el('span', { class: 'chip' }, tn('count.diagrams', set.diagrams.length)) : null,
      due ? el('span', { class: 'chip chip-due' }, tn('set.dueNow', due)) : null,
      el('span', { class: 'chip' }, t('set.progress', { p: formatPercent(mastery) }))));
}

/* What a dragged set carries: its id, under a type of our own, so that
   nothing else dropped on the page is taken for a set. */
const DRAG_TYPE = 'application/x-quizzer-set';

/* Lets card, the card of set, be dragged to a folder or out of one. While
   it is, zone is marked, so the places to drop it show. The link the card
   is does not travel: dropped elsewhere, it would open. */
function movable(card, set, zone) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.clearData();
    event.dataTransfer.setData(DRAG_TYPE, set.id);
    event.dataTransfer.effectAllowed = 'move';
    zone.dataset.dragging = '1';
  });
  card.addEventListener('dragend', () => zone.removeAttribute('data-dragging'));
  return card;
}

/* Makes node a place to drop a set, which then goes to the folder of
   that id, or out of its folder for no id. */
function takesSets(node, folderId, repaint) {
  const carries = (event) => Boolean(event.dataTransfer) && [...event.dataTransfer.types].includes(DRAG_TYPE);
  node.addEventListener('dragover', (event) => {
    if (!carries(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.dataset.drop = '1';
  });
  node.addEventListener('dragleave', (event) => {
    if (!node.contains(event.relatedTarget)) node.removeAttribute('data-drop');
  });
  node.addEventListener('drop', (event) => {
    if (!carries(event)) return;
    event.preventDefault();
    node.removeAttribute('data-drop');
    const set = store.getSet(event.dataTransfer.getData(DRAG_TYPE));
    if (!set || set.folder === folderId) return;
    store.updateSet(set.id, { folder: folderId });
    const folder = store.getFolder(folderId);
    toastSaved(folder ? t('folder.moved', { folder: folder.name }) : t('folder.movedOut'));
    repaint();
  });
  return node;
}

/* A folder and its sets, folded away or not as the learner left it, with
   ways to add a set to it, rename it and delete it. A set dropped on it,
   open or not, goes into it. */
function folderSection(folder, sets, zone, repaint) {
  const rename = () => {
    const name = prompt(t('folder.namePrompt'), folder.name);
    if (name !== null && store.renameFolder(folder.id, name)) repaint();
  };
  const remove = () => {
    if (!confirm(t('folder.deleteConfirm', { name: folder.name }))) return;
    store.deleteFolder(folder.id);
    toastSaved(t('folder.deleted'));
    repaint();
  };
  const node = el('details', {
    class: 'folder', open: folder.open,
    ontoggle: () => store.setFolderOpen(folder.id, node.open),
  },
  el('summary', {}, icon('folder'), folder.name, el('span', { class: 'chip' }, tn('count.sets', sets.length))),
  el('div', { class: 'row folder-tools' },
    el('a', { class: 'btn btn-ghost', href: '#/new/' + folder.id }, icon('plus'), t('folder.newSet')),
    el('button', { type: 'button', class: 'btn btn-ghost', onclick: rename }, icon('edit'), t('folder.rename')),
    el('button', { type: 'button', class: 'btn btn-ghost', onclick: remove }, icon('trash'), t('folder.delete'))),
  sets.length
    ? el('div', { class: 'set-grid' }, sets.map((set) => movable(setCard(set), set, zone)))
    : el('p', { class: 'chart-sub' }, t('folder.empty', { folder: t('editor.folder') })));
  return takesSets(node, folder.id, repaint);
}

/* The folders by name, then the sets in none, which is also where a set
   is dropped to leave its folder: with every set in a folder, that place
   only shows while one is dragged. A search looks through all the sets
   and shows what it finds without the folders. */
function setsSection() {
  const body = el('div');
  const notice = el('p', { class: 'chart-sub', hidden: true }, t('home.noMatch'));

  function paint() {
    body.removeAttribute('data-dragging');
    const sets = store.getSets();
    const needle = search.value.trim().toLowerCase();
    if (needle) {
      const matches = sets.filter((set) => (set.title + ' ' + set.description).toLowerCase().includes(needle));
      mount(body, el('div', { class: 'set-grid' }, matches.map(setCard)));
      notice.hidden = matches.length > 0;
      return;
    }
    notice.hidden = true;
    const folders = foldersByName();
    const loose = sets.filter((set) => !set.folder);
    const grid = el('div', { class: 'set-grid' }, loose.map((set) => (
      folders.length ? movable(setCard(set), set, body) : setCard(set))));
    mount(body,
      folders.map((folder) => folderSection(folder, sets.filter((set) => set.folder === folder.id), body, paint)),
      folders.length
        ? takesSets(el('div', { class: 'folder-out' },
            loose.length
              ? el('h3', { class: 'folder-loose' }, t('home.unfiled'))
              : el('p', { class: 'chart-sub drop-hint' }, t('folder.dropOut')),
            grid), '', paint)
        : grid);
  }

  const search = el('input', {
    type: 'search', class: 'input', placeholder: t('home.searchPlaceholder'),
    'aria-label': t('home.searchPlaceholder'), oninput: paint,
  });
  const newFolder = el('button', {
    type: 'button', class: 'btn',
    onclick: () => {
      const name = prompt(t('folder.namePrompt'), '');
      if (name !== null && store.createFolder(name)) paint();
    },
  }, icon('folder'), t('home.newFolder'));
  paint();

  /* The samples stay on offer once sets exist: only the missing ones are
     added, so sample sets shipped later can still be loaded. */
  return el('section', {},
    el('div', { class: 'row-between', style: { marginBottom: '14px' } },
      el('h2', {}, t('home.sets')),
      el('div', { class: 'row' },
        samplesButton(),
        newFolder,
        el('a', { class: 'btn', href: '#/new' }, icon('plus'), t('home.cta.create')))),
    store.getSets().length > 4 ? el('div', { class: 'search-bar' }, search) : null,
    notice,
    body);
}

function samplesButton() {
  return el('a', { class: 'btn', href: '#/samples' }, icon('book'), t('home.cta.samples'));
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
    sets.length || store.getFolders().length ? setsSection() : emptyState());
}
