/* Dashboard: what is due right now, how the last two weeks went, and the sets
   themselves. */

import { el, icon, mount, toast } from '../dom.js';
import { t, tn, formatDayKey, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, masteryPct } from '../srs.js';
import { statTile, meter, activityChart, figure } from '../chart.js';
import { foldersIn, folderTree, folderPath, toastSaved } from './shared.js';

function setCard(set) {
  const due = dueCards(set.cards).length;
  const mastery = masteryPct(set.cards);
  return el('a', { class: 'set-card', href: '#/set/' + set.id },
    el('h3', {}, set.title),
    set.description ? el('p', {}, set.description) : null,
    meter(mastery),
    el('div', { class: 'set-card-meta' },
      el('span', { class: 'chip' }, tn('count.cards', set.cards.length)),
      set.diagrams.length ? el('span', { class: 'chip' }, tn('count.diagrams', set.diagrams.length)) : null,
      due ? el('span', { class: 'chip chip-due' }, tn('set.dueNow', due)) : null,
      el('span', { class: 'chip' }, t('set.progress', { p: formatPercent(mastery) }))));
}

/* What a dragged set or folder carries: its id, under a type of our own,
   so that nothing else dropped on the page is taken for one. */
const DRAG_SET = 'application/x-quizzer-set';
const DRAG_FOLDER = 'application/x-quizzer-folder';

/* Lets handle be dragged to a folder or out of one, carrying id under
   type. While it is, zone is marked, so the places to drop it show, and so
   is moved, the node that goes with the handle. A handle that is a link
   does not travel as one: dropped elsewhere, it would open. */
function movable(handle, type, id, zone, moved = handle) {
  handle.setAttribute('draggable', 'true');
  handle.addEventListener('dragstart', (event) => {
    event.dataTransfer.clearData();
    event.dataTransfer.setData(type, id);
    event.dataTransfer.effectAllowed = 'move';
    zone.dataset.dragging = '1';
    moved.dataset.dragged = '1';
  });
  handle.addEventListener('dragend', () => {
    zone.removeAttribute('data-dragging');
    moved.removeAttribute('data-dragged');
  });
  return handle;
}

/* Puts the set of that id in a folder, or out of its folder for no
   folder id, and says so. */
function fileSet(id, folderId) {
  const set = store.getSet(id);
  if (!set || set.folder === folderId) return;
  store.updateSet(id, { folder: folderId });
  const folder = store.getFolder(folderId);
  toastSaved(folder ? t('folder.moved', { folder: folder.name }) : t('folder.movedOut'));
}

/* The same for a folder, which a folder with too many levels around it
   and inside it does not take. */
function fileFolder(id, parent) {
  const folder = store.getFolder(id);
  if (!folder || folder.parent === parent) return;
  if (!store.moveFolder(id, parent)) {
    toast(t('folder.tooDeep', { n: store.FOLDER_LEVELS }));
    return;
  }
  const home = store.getFolder(parent);
  toastSaved(home ? t('folder.nested', { folder: home.name }) : t('folder.nestedOut'));
}

/* Makes node a place to drop a set or a folder, which then goes to the
   folder of that id, or out of its folder for no id. Folders sit one in
   the other, so only the innermost under the pointer takes the drop, and
   a folder is never dropped on itself or on what it holds. */
function takesDrops(node, folderId, zone, repaint) {
  const carried = (event) => [DRAG_SET, DRAG_FOLDER]
    .find((type) => event.dataTransfer && [...event.dataTransfer.types].includes(type));
  const aim = (target) => {
    for (const other of zone.querySelectorAll('[data-drop]')) other.removeAttribute('data-drop');
    if (target) target.dataset.drop = '1';
  };
  node.addEventListener('dragover', (event) => {
    if (!carried(event)) return;
    event.stopPropagation();
    if (node.closest('[data-dragged]')) {
      aim(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    aim(node);
  });
  node.addEventListener('dragleave', (event) => {
    if (!node.contains(event.relatedTarget)) node.removeAttribute('data-drop');
  });
  node.addEventListener('drop', (event) => {
    const type = carried(event);
    if (!type) return;
    event.stopPropagation();
    if (node.closest('[data-dragged]')) return;
    event.preventDefault();
    const id = event.dataTransfer.getData(type);
    if (type === DRAG_SET) fileSet(id, folderId);
    else fileFolder(id, folderId);
    repaint();
  });
  return node;
}

/* The button that asks for a name and makes a folder, in the folder of
   that id if any. */
function newFolderButton(parent, repaint, look) {
  return el('button', {
    type: 'button', class: look,
    onclick: () => {
      const name = prompt(t('folder.namePrompt'), '');
      if (name !== null && store.createFolder(name, parent)) repaint();
    },
  }, icon('folder'), t('home.newFolder'));
}

/* A folder with the folders and the sets it holds, folded away or not as
   the learner left it, with ways to add a set or a folder to it, rename
   it, delete it and put it in another folder. A set or a folder dropped
   on it, open or not, goes into it, and it is dragged by its name. level
   is 1 for a folder in no other. view carries the zone the drags mark,
   the way to draw the page again, the number of sets under each folder
   and the list of folders to choose a parent from. */
function folderSection(folder, level, view) {
  const { zone, repaint } = view;
  const sets = store.getSets().filter((set) => set.folder === folder.id);
  const inside = foldersIn(folder.id);
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
  const homes = new Set(store.folderHomes(folder.id).map((home) => home.id));
  const parent = el('select', {
    class: 'select-compact',
    onchange: () => {
      fileFolder(folder.id, parent.value);
      repaint();
    },
  },
  el('option', { value: '' }, t('editor.folderNone')),
  view.paths.filter(([id]) => homes.has(id)).map(([id, path]) => el('option', { value: id }, path)));
  parent.value = folder.parent;

  const summary = el('summary', {},
    icon('folder'), folder.name, el('span', { class: 'chip' }, tn('count.sets', view.counts.get(folder.id) || 0)));
  const node = el('details', {
    class: 'folder', open: folder.open,
    ontoggle: () => store.setFolderOpen(folder.id, node.open),
  },
  summary,
  el('div', { class: 'row folder-tools' },
    el('a', { class: 'btn btn-ghost', href: '#/new/' + folder.id }, icon('plus'), t('folder.newSet')),
    level < store.FOLDER_LEVELS ? newFolderButton(folder.id, repaint, 'btn btn-ghost') : null,
    el('button', { type: 'button', class: 'btn btn-ghost', onclick: rename }, icon('edit'), t('folder.rename')),
    el('button', { type: 'button', class: 'btn btn-ghost', onclick: remove }, icon('trash'), t('folder.delete')),
    view.paths.length > 1 ? el('label', { class: 'folder-parent' }, t('folder.parent'), parent) : null),
  inside.map((held) => folderSection(held, level + 1, view)),
  sets.length
    ? el('div', { class: 'set-grid' }, sets.map((set) => movable(setCard(set), DRAG_SET, set.id, zone)))
    : inside.length ? null : el('p', { class: 'chart-sub' }, t('folder.empty', { folder: t('editor.folder') })));
  movable(summary, DRAG_FOLDER, folder.id, zone, node);
  return takesDrops(node, folder.id, zone, repaint);
}

/* The folders by name, each with those it holds, then the sets in none,
   which is also where a set or a folder is dropped to leave its folder:
   with every set in a folder, that place only shows while something is
   dragged. A search looks through all the sets and shows what it finds
   without the folders. */
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
    const counts = new Map();
    for (const set of sets) {
      for (const { id } of store.folderLineage(set.folder)) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const paths = folderTree().map((folder) => [folder.id, folderPath(folder.id)]);
    const loose = sets.filter((set) => !set.folder);
    const grid = el('div', { class: 'set-grid' }, loose.map((set) => (
      paths.length ? movable(setCard(set), DRAG_SET, set.id, body) : setCard(set))));
    mount(body,
      foldersIn().map((folder) => folderSection(folder, 1, { zone: body, repaint: paint, counts, paths })),
      paths.length
        ? takesDrops(el('div', { class: 'folder-out' },
            loose.length
              ? el('h3', { class: 'folder-loose' }, t('home.unfiled'))
              : el('p', { class: 'chart-sub drop-hint' }, t('folder.dropOut')),
            grid), '', body, paint)
        : grid);
  }

  const search = el('input', {
    type: 'search', class: 'input', placeholder: t('home.searchPlaceholder'),
    'aria-label': t('home.searchPlaceholder'), oninput: paint,
  });
  paint();

  /* The samples stay on offer once sets exist: only the missing ones are
     added, so sample sets shipped later can still be loaded. */
  return el('section', {},
    el('div', { class: 'row-between', style: { marginBottom: '14px' } },
      el('h2', {}, t('home.sets')),
      el('div', { class: 'row' },
        samplesButton(),
        newFolderButton('', paint, 'btn'),
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
