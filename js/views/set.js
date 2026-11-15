/* One set: how far along it is, the ways to study it, and its cards. */

import { el, icon, toast } from '../dom.js';
import { t, tn, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, masteryPct } from '../srs.js';
import { meter } from '../chart.js';
import { download, slugify, toCSV } from '../io.js';
import { navigate } from '../router.js';
import { notFoundPanel, shareControls, cardRow, toastSaved, hasPictures, folderPath } from './shared.js';
import { askable } from '../study.js';

const MODES = [
  { path: 'cards', key: 'mode.flashcards', glyph: 'cards', min: 1 },
  { path: 'learn', key: 'mode.learn', glyph: 'target', min: 2, typed: true },
  { path: 'review', key: 'mode.review', glyph: 'repeat', min: 1 },
  { path: 'quiz', key: 'mode.quiz', glyph: 'quiz', min: 2, typed: true },
  { path: 'test', key: 'mode.test', glyph: 'test', min: 2, typed: true },
  { path: 'write', key: 'mode.write', glyph: 'keyboard', min: 1, typed: true },
  { path: 'match', key: 'mode.match', glyph: 'grid', min: 4 },
  { path: 'labels', key: 'mode.labels', glyph: 'image', pictures: true },
  { path: 'stats', key: 'mode.stats', glyph: 'chart', min: 0 },
];

/* Labels needs labelled pictures rather than cards, and only shows when
   the set has some. A mode whose answers are typed or picked counts the
   cards that have text, since a card of pictures alone cannot be asked,
   and says so when those are what is missing. */
function modeCard(set, mode) {
  const cards = mode.typed ? set.cards.filter(askable).length : set.cards.length;
  const available = mode.pictures || cards >= mode.min;
  const need = mode.typed && set.cards.length >= mode.min ? 'set.needTextCards' : 'set.needCards';
  const props = available
    ? { class: 'mode-card', href: '#/set/' + set.id + '/' + mode.path }
    : { class: 'mode-card', 'aria-disabled': 'true', role: 'link' };
  return el('a', props,
    el('span', { class: 'mode-icon' }, icon(mode.glyph)),
    el('span', {},
      el('strong', {}, t(mode.key)),
      el('small', {}, available ? t(mode.key + '.desc') : tn(need, mode.min))));
}

export function setView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const due = dueCards(set.cards).length;
  const mastery = masteryPct(set.cards);
  const folder = folderPath(set.folder);
  const share = shareControls(() => store.getSet(set.id), { label: t('set.share') });

  const remove = el('button', { type: 'button', class: 'btn btn-danger' }, icon('trash'), t('common.delete'));
  remove.addEventListener('click', () => {
    if (!confirm(t('set.deleteConfirm', { name: set.title }))) return;
    store.deleteSet(set.id);
    toastSaved(t('set.deleted'));
    navigate('');
  });

  const exportCsv = el('button', { type: 'button', class: 'btn' }, icon('download'), t('transfer.exportSetCsv'));
  exportCsv.addEventListener('click', () => {
    download(slugify(set.title) + '.csv', toCSV(set), 'text/csv');
    if (hasPictures(set)) toast(t('transfer.csvNoImages'));
  });

  return el('div', { class: 'container' },
    el('header', { class: 'set-head' },
      el('h1', {}, set.title),
      set.description ? el('p', { class: 'lede set-description' }, set.description) : null,
      el('div', { class: 'row', style: { marginBottom: '12px' } },
        folder ? el('span', { class: 'chip chip-folder' }, icon('folder'), folder) : null,
        el('span', { class: 'chip' }, tn('count.cards', set.cards.length)),
        set.diagrams.length ? el('span', { class: 'chip' }, tn('count.diagrams', set.diagrams.length)) : null,
        due ? el('span', { class: 'chip chip-due' }, tn('set.dueNow', due)) : el('span', { class: 'chip' }, t('set.upToDate')),
        el('span', { class: 'chip chip-accent' }, t('set.progress', { p: formatPercent(mastery) }))),
      meter(mastery),
      el('div', { class: 'row', style: { marginTop: '16px' } },
        el('a', { class: 'btn', href: '#/set/' + set.id + '/edit' }, icon('edit'), t('common.edit')),
        share.button,
        exportCsv,
        el('button', { type: 'button', class: 'btn', onclick: () => window.print() }, icon('print'), t('common.print')),
        remove),
      share.notice,
      share.field),

    el('section', { class: 'mode-grid' },
      MODES.filter((mode) => !mode.pictures || set.diagrams.length).map((mode) => modeCard(set, mode))),

    el('section', {},
      el('div', { class: 'row-between', style: { marginBottom: '12px' } },
        el('h2', {}, t('set.cardsTitle')),
        el('span', { class: 'chart-sub' }, tn('count.cards', set.cards.length))),
      el('div', { class: 'card-list print-sheet' }, set.cards.map((card) => cardRow(card, set,
        card.star ? el('span', { class: 'chip', title: t('flashcards.star') }, icon('star')) : null)))));
}
