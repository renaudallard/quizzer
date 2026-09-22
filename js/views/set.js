/* One set: how far along it is, the five ways to study it, and its cards. */

import { el, icon, toast } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { dueCards, masteryPct } from '../srs.js';
import { meter } from '../chart.js';
import { download, slugify, toCSV } from '../io.js';
import { navigate } from '../router.js';
import { notFoundPanel, shareControls } from './shared.js';

const MODES = [
  { path: 'cards', key: 'mode.flashcards', glyph: 'cards', min: 1 },
  { path: 'review', key: 'mode.review', glyph: 'repeat', min: 1 },
  { path: 'quiz', key: 'mode.quiz', glyph: 'quiz', min: 2 },
  { path: 'write', key: 'mode.write', glyph: 'keyboard', min: 1 },
  { path: 'match', key: 'mode.match', glyph: 'grid', min: 4 },
  { path: 'stats', key: 'mode.stats', glyph: 'chart', min: 1 },
];

function modeCard(set, mode) {
  const available = set.cards.length >= mode.min;
  const props = available
    ? { class: 'mode-card', href: '#/set/' + set.id + '/' + mode.path }
    : { class: 'mode-card', 'aria-disabled': 'true', role: 'link' };
  return el('a', props,
    el('span', { class: 'mode-icon' }, icon(mode.glyph)),
    el('span', {},
      el('strong', {}, t(mode.key)),
      el('small', {}, available ? t(mode.key + '.desc') : t('set.needCards', { n: mode.min }))));
}

function cardRow(set, card) {
  return el('div', { class: 'card-row' },
    el('div', { class: 'term' },
      el('span', { lang: set.termLang || null }, card.term),
      card.hint ? el('span', { class: 'hint' }, card.hint) : null),
    el('div', { class: 'def', lang: set.defLang || null }, card.def),
    el('div', { class: 'card-row-tools' },
      card.star ? el('span', { class: 'chip', title: t('flashcards.star') }, icon('star')) : null));
}

export function setView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const due = dueCards(set.cards).length;
  const mastery = masteryPct(set.cards);
  const share = shareControls(() => store.getSet(set.id), { label: t('set.share') });

  const remove = el('button', { type: 'button', class: 'btn btn-danger' }, icon('trash'), t('common.delete'));
  remove.addEventListener('click', () => {
    if (!confirm(t('set.deleteConfirm', { name: set.title }))) return;
    store.deleteSet(set.id);
    toast(t('set.deleted'));
    navigate('');
  });

  const exportCsv = el('button', { type: 'button', class: 'btn' }, icon('download'), t('transfer.exportSetCsv'));
  exportCsv.addEventListener('click', () => {
    download(slugify(set.title) + '.csv', toCSV(set), 'text/csv');
  });

  return el('div', { class: 'container' },
    el('header', { class: 'set-head' },
      el('h1', {}, set.title),
      set.description ? el('p', { class: 'lede' }, set.description) : null,
      el('div', { class: 'row', style: { marginBottom: '12px' } },
        el('span', { class: 'chip' }, tn('count.cards', set.cards.length)),
        due ? el('span', { class: 'chip chip-due' }, tn('set.dueNow', due)) : el('span', { class: 'chip' }, t('set.upToDate')),
        el('span', { class: 'chip chip-accent' }, t('set.progress', { p: mastery }))),
      meter(mastery),
      el('div', { class: 'row', style: { marginTop: '16px' } },
        el('a', { class: 'btn', href: '#/set/' + set.id + '/edit' }, icon('edit'), t('common.edit')),
        share.button,
        exportCsv,
        el('button', { type: 'button', class: 'btn', onclick: () => window.print() }, icon('print'), t('common.print')),
        remove),
      share.notice,
      share.field),

    el('section', { class: 'mode-grid' }, MODES.map((mode) => modeCard(set, mode))),

    el('section', {},
      el('div', { class: 'row-between', style: { marginBottom: '12px' } },
        el('h2', {}, t('set.cardsTitle')),
        el('span', { class: 'chart-sub' }, tn('count.cards', set.cards.length))),
      el('div', { class: 'card-list print-sheet' }, set.cards.map((card) => cardRow(set, card)))));
}
