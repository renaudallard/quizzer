/* Create and edit a set. The draft is held in memory and written to the store
   only when the learner presses save. */

import { el, icon, toast, mount } from '../dom.js';
import { t, tn, getLocale } from '../i18n/index.js';
import * as store from '../store.js';
import { uid } from '../util.js';
import { parseDelimited } from '../io.js';
import { navigate, onCleanup, setBusy } from '../router.js';
import { notFoundPanel } from './shared.js';

const LANG_CODES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'ru', 'uk', 'ar', 'tr',
  'zh', 'ja', 'ko', 'la', 'el', 'sv', 'da', 'nb', 'fi', 'cs', 'he', 'hi', 'ro', 'hu', 'vi', 'id',
];

function blankCard() {
  return { id: uid(), term: '', def: '', hint: '', star: false, box: 0, due: 0, seen: 0, correct: 0, lapses: 0 };
}

function languageSelect(value, onChange) {
  let names = null;
  try {
    names = new Intl.DisplayNames([getLocale()], { type: 'language' });
  } catch {
    names = null;
  }
  const options = [el('option', { value: '' }, t('editor.langNone'))];
  for (const code of LANG_CODES) {
    const label = names ? names.of(code) : code;
    options.push(el('option', { value: code }, label));
  }
  const select = el('select', { class: 'select', onchange: () => onChange(select.value) }, options);
  select.value = value || '';
  return select;
}

export function editorView(id) {
  const existing = id ? store.getSet(id) : null;
  if (id && !existing) return notFoundPanel(t('set.notFound'));

  const draft = existing
    ? { ...existing, cards: existing.cards.map((card) => ({ ...card })) }
    : { title: '', description: '', termLang: '', defLang: '', cards: [blankCard(), blankCard(), blankCard()] };

  let dirty = false;
  const markDirty = () => { dirty = true; };

  const guard = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', guard);
  onCleanup(() => window.removeEventListener('beforeunload', guard));
  setBusy(() => dirty);

  const list = el('div', { class: 'card-list' });

  function focusRow(index) {
    const input = list.querySelectorAll('.editor-row input[data-role="term"]')[index];
    if (input) input.focus();
  }

  function cardRow(card, index) {
    const term = el('input', {
      type: 'text', class: 'input', value: card.term, dataset: { role: 'term' },
      placeholder: t('editor.termPlaceholder'), 'aria-label': t('common.term'),
      lang: draft.termLang || null,
      oninput: () => { card.term = term.value; markDirty(); },
    });
    const def = el('input', {
      type: 'text', class: 'input', value: card.def,
      placeholder: t('editor.defPlaceholder'), 'aria-label': t('common.definition'),
      lang: draft.defLang || null,
      oninput: () => { card.def = def.value; markDirty(); },
    });
    const hint = el('input', {
      type: 'text', class: 'input', value: card.hint,
      placeholder: t('editor.hintPlaceholder'), 'aria-label': t('common.hint'),
      oninput: () => { card.hint = hint.value; markDirty(); },
    });

    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= draft.cards.length) return;
      const [moved] = draft.cards.splice(index, 1);
      draft.cards.splice(target, 0, moved);
      markDirty();
      paint();
      focusRow(target);
    };

    return el('div', { class: 'editor-row' },
      el('span', { class: 'idx' }, String(index + 1)),
      el('div', { class: 'editor-fields' }, term, hint),
      def,
      el('div', { class: 'editor-row-tools' },
        el('button', {
          type: 'button', class: 'icon-btn', 'aria-label': t('common.moveUp'),
          disabled: index === 0, onclick: () => move(-1),
        }, icon('up')),
        el('button', {
          type: 'button', class: 'icon-btn', 'aria-label': t('common.moveDown'),
          disabled: index === draft.cards.length - 1, onclick: () => move(1),
        }, icon('down')),
        el('button', {
          type: 'button', class: 'icon-btn', 'aria-label': t('editor.removeCard'),
          onclick: () => {
            draft.cards.splice(index, 1);
            if (!draft.cards.length) draft.cards.push(blankCard());
            markDirty();
            paint();
          },
        }, icon('trash'))));
  }

  function paint() {
    mount(list, draft.cards.map(cardRow));
  }
  paint();

  const bulkText = el('textarea', {
    class: 'textarea', placeholder: t('editor.bulkPlaceholder'),
    'aria-label': t('editor.bulk'),
  });
  const bulkButton = el('button', { type: 'button', class: 'btn' }, icon('plus'), t('editor.bulkAdd'));
  bulkButton.addEventListener('click', () => {
    const parsed = parseDelimited(bulkText.value);
    if (!parsed.length) {
      toast(t('editor.bulkEmpty'));
      return;
    }
    for (const entry of parsed) draft.cards.push({ ...blankCard(), ...entry });
    draft.cards = draft.cards.filter((card) => card.term || card.def);
    bulkText.value = '';
    markDirty();
    paint();
    toast(tn('editor.bulkAdded', parsed.length));
  });

  const title = el('input', {
    type: 'text', class: 'input', value: draft.title, required: true,
    placeholder: t('editor.namePlaceholder'),
    oninput: () => { draft.title = title.value; markDirty(); },
  });
  const description = el('input', {
    type: 'text', class: 'input', value: draft.description,
    placeholder: t('editor.descriptionPlaceholder'),
    oninput: () => { draft.description = description.value; markDirty(); },
  });

  function save() {
    draft.title = draft.title.trim();
    if (!draft.title) {
      toast(t('editor.needName'));
      title.focus();
      return;
    }
    const cards = draft.cards.filter((card) => card.term.trim() && card.def.trim());
    if (!cards.length) {
      toast(t('editor.needCard'));
      return;
    }
    dirty = false;
    const payload = {
      title: draft.title,
      description: draft.description.trim(),
      termLang: draft.termLang,
      defLang: draft.defLang,
      cards,
    };
    const saved = existing ? store.updateSet(existing.id, payload) : store.createSet(payload);
    toast(t('editor.saved'));
    navigate('set/' + saved.id);
  }

  const cancel = el('button', { type: 'button', class: 'btn btn-ghost' }, t('common.cancel'));
  cancel.addEventListener('click', () => {
    if (dirty && !confirm(t('editor.discard'))) return;
    dirty = false;
    navigate(existing ? 'set/' + existing.id : '');
  });

  const addCard = el('button', { type: 'button', class: 'btn' }, icon('plus'), t('editor.addCard'));
  addCard.addEventListener('click', () => {
    draft.cards.push(blankCard());
    markDirty();
    paint();
    focusRow(draft.cards.length - 1);
  });

  return el('div', { class: 'container' },
    el('h1', {}, existing ? t('editor.editTitle') : t('editor.newTitle')),

    el('section', { class: 'panel stack', style: { marginBottom: '20px' } },
      el('label', { class: 'field' }, el('span', {}, t('editor.name')), title),
      el('label', { class: 'field' }, el('span', {}, t('editor.description')), description),
      el('div', { class: 'row' },
        el('label', { class: 'field', style: { flex: '1 1 200px' } },
          el('span', {}, t('editor.termLang')),
          languageSelect(draft.termLang, (value) => { draft.termLang = value; markDirty(); })),
        el('label', { class: 'field', style: { flex: '1 1 200px' } },
          el('span', {}, t('editor.defLang')),
          languageSelect(draft.defLang, (value) => { draft.defLang = value; markDirty(); }))),
      el('p', { class: 'field-hint' }, t('editor.langHint'))),

    el('section', { style: { marginBottom: '20px' } },
      el('div', { class: 'row-between', style: { marginBottom: '12px' } },
        el('h2', {}, t('editor.cards')),
        addCard),
      list),

    el('section', { class: 'panel stack', style: { marginBottom: '20px' } },
      el('h2', {}, t('editor.bulk')),
      el('p', { class: 'field-hint' }, t('editor.bulkHint')),
      bulkText,
      el('div', { class: 'row' }, bulkButton)),

    el('div', { class: 'sticky-actions' },
      el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: save }, t('common.save')),
      cancel));
}
