/* Import, export and share. Everything stays on the machine: an export is a
   file download, a share link carries the cards in its own fragment. */

import { el, icon, toast } from '../dom.js';
import { t, tn, setLocale } from '../i18n/index.js';
import * as store from '../store.js';
import { getTheme, setTheme } from '../theme.js';
import { download, parseDelimited, readText, decodeShare } from '../io.js';
import { navigate, setBusy } from '../router.js';
import { dayKey } from '../util.js';
import { notFoundPanel, shareControls, cardRow } from './shared.js';


function exportPanel() {
  const sets = store.getSets();
  const button = el('button', {
    type: 'button', class: 'btn btn-primary',
    disabled: sets.length === 0,
    /* The local day, like the activity and the streak, not the UTC one. */
    onclick: () => download('quizzer-' + dayKey() + '.json', store.exportAll()),
  }, icon('download'), t('transfer.exportAll'));

  return el('section', { class: 'panel stack' },
    el('h2', {}, t('transfer.exportTitle')),
    el('p', { class: 'field-hint' }, t('transfer.exportBody')),
    el('div', { class: 'row' }, button),
    sets.length ? null : el('p', { class: 'field-hint' }, t('transfer.exportNothing')));
}

function importPanel() {
  const input = el('input', {
    type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'import-file',
  });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const count = store.importPayload(JSON.parse(await file.text()));
      /* A backup brings its settings back: apply them now, not on the next visit. */
      setLocale(store.getSettings().locale);
      setTheme(getTheme());
      toast(tn('transfer.importOk', count));
      navigate('');
    } catch {
      toast(t('transfer.importFailed'));
    } finally {
      input.value = '';
    }
  });

  return el('section', { class: 'panel stack' },
    el('h2', {}, t('transfer.importTitle')),
    el('p', { class: 'field-hint' }, t('transfer.importBody')),
    el('div', { class: 'row' },
      input,
      el('label', { class: 'btn', for: 'import-file' }, icon('upload'), t('transfer.importFile'))));
}

function pastePanel() {
  const name = el('input', { type: 'text', class: 'input', placeholder: t('editor.namePlaceholder') });
  const text = el('textarea', {
    class: 'textarea', placeholder: t('transfer.csvPlaceholder'), 'aria-label': t('transfer.csvTitle'),
  });
  setBusy(() => Boolean(text.value.trim() || name.value.trim()));
  const file = el('input', {
    type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain',
    class: 'sr-only', id: 'csv-file',
  });
  /* A file only fills the box: the cards come from the same button as pasted
     text, once the learner has seen them. */
  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    try {
      text.value = await readText(chosen);
      if (!name.value.trim()) name.value = chosen.name.replace(/\.[^.]+$/, '');
    } catch {
      toast(t('transfer.fileFailed'));
    } finally {
      file.value = '';
    }
  });
  const create = el('button', { type: 'button', class: 'btn btn-primary' }, icon('plus'), t('transfer.csvCreate'));

  create.addEventListener('click', () => {
    const cards = parseDelimited(text.value);
    if (!cards.length) {
      toast(t('editor.bulkEmpty'));
      return;
    }
    if (!name.value.trim()) {
      toast(t('editor.needName'));
      name.focus();
      return;
    }
    const set = store.createSet({ title: name.value.trim(), cards });
    toast(tn('editor.bulkAdded', cards.length));
    navigate('set/' + set.id);
  });

  return el('section', { class: 'panel stack' },
    el('h2', {}, t('transfer.csvTitle')),
    el('p', { class: 'field-hint' }, t('transfer.csvBody')),
    el('div', { class: 'row' },
      file,
      el('label', { class: 'btn', for: 'csv-file' }, icon('upload'), t('transfer.csvFile'))),
    el('label', { class: 'field' }, el('span', {}, t('transfer.csvName')), name),
    text,
    el('div', { class: 'row' }, create));
}

function sharePanel() {
  const sets = store.getSets();
  if (!sets.length) return null;

  const picker = el('select', { class: 'select' },
    sets.map((set) => el('option', { value: set.id }, set.title)));
  const share = shareControls(() => store.getSet(picker.value), { label: t('transfer.shareCopy'), primary: true });

  return el('section', { class: 'panel stack' },
    el('h2', {}, t('transfer.shareTitle')),
    el('p', { class: 'field-hint' }, t('transfer.shareBody')),
    el('label', { class: 'field' }, el('span', {}, t('transfer.sharePick')), picker),
    el('div', { class: 'row' }, share.button),
    share.notice,
    share.field);
}

export function transferView() {
  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('transfer.title')),
    el('p', { class: 'lede' }, t('transfer.lede')),
    exportPanel(),
    importPanel(),
    pastePanel(),
    sharePanel());
}

export function sharedView(payload) {
  const incoming = decodeShare(payload);
  if (!incoming) return notFoundPanel(t('transfer.sharedInvalid'));

  const add = el('button', { type: 'button', class: 'btn btn-primary btn-lg' }, icon('plus'), t('transfer.sharedAdd'));
  add.addEventListener('click', () => {
    const set = store.createSet(incoming);
    toast(t('transfer.sharedAdded'));
    navigate('set/' + set.id);
  });

  return el('div', { class: 'container container-narrow stack' },
    el('h1', {}, t('transfer.sharedTitle')),
    el('p', { class: 'lede' }, t('transfer.sharedBody', {
      name: incoming.title,
      cards: tn('count.cards', incoming.cards.length),
    })),
    el('div', { class: 'row' }, add, el('a', { class: 'btn', href: '#/' }, t('common.cancel'))),
    el('section', { class: 'panel' },
      el('h2', {}, t('set.cardsTitle')),
      el('div', { class: 'card-list' },
        incoming.cards.slice(0, 12).map((card) => cardRow(card, incoming)))));
}
