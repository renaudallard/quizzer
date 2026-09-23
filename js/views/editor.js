/* Create and edit a set. The draft is held in memory and written to the store
   only when the learner presses save. */

import { el, icon, toast, mount } from '../dom.js';
import { t, tn, getLocale } from '../i18n/index.js';
import * as store from '../store.js';
import { parseDelimited } from '../io.js';
import { navigate, onCleanup, setBusy } from '../router.js';
import { notFoundPanel, toastSaved } from './shared.js';
import { addImage, cardImage } from '../images.js';

const LANG_CODES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'ru', 'uk', 'ar', 'tr',
  'zh', 'ja', 'ko', 'la', 'el', 'sv', 'da', 'nb', 'fi', 'cs', 'he', 'hi', 'ro', 'hu', 'vi', 'id',
];

/* Signs a keyboard lacks, for maths and science cards. */
const SYMBOLS = [
  '²', '³', 'ⁿ', '√', 'π', '±', '×', '÷', '·', '≤', '≥', '≠', '≈', '∞', '∑', '∫', '∂',
  'Δ', 'α', 'β', 'θ', 'λ', 'μ', 'σ', 'φ', 'ω', '°', '½', '→', '∈',
];

/* Why a picture could not be kept, as addImage() reports it. */
const IMAGE_ERRORS = {
  type: 'editor.imageNotImage',
  size: 'editor.imageTooBig',
  unavailable: 'editor.imageFailed',
};

function blankCard() {
  return store.normalizeCard({});
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

  /* A side is filled by its text or its picture. A row nobody used is a
     blank starter row, never a stored card, which would take its progress
     with it. Only such rows are dropped without a word. */
  const filled = (text, image) => Boolean(text.trim() || image);
  const complete = (card) => filled(card.term, card.termImage) && filled(card.def, card.defImage);
  const stored = new Set(existing ? existing.cards.map((card) => card.id) : []);
  const unused = (card) => !stored.has(card.id) && !card.hint.trim()
    && !filled(card.term, card.termImage) && !filled(card.def, card.defImage);

  const guard = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', guard);
  onCleanup(() => window.removeEventListener('beforeunload', guard));
  setBusy(() => dirty);

  const list = el('div', { class: 'card-list' });

  function focusRow(index) {
    const input = list.querySelectorAll('.editor-row input[data-role="term"]')[index];
    if (input) input.focus();
  }

  /* The picture of one side: a thumbnail with a way to take it off, or a
     button to pick one. attach() also serves pasted and dropped pictures. */
  function imagePicker(card, key, label) {
    const holder = el('div', { class: 'editor-image' });
    const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
    file.addEventListener('change', () => {
      if (file.files && file.files[0]) attach(file.files[0]);
      file.value = '';
    });
    async function attach(picture) {
      try {
        card[key] = await addImage(picture);
      } catch (error) {
        toast(t(IMAGE_ERRORS[error.message] || 'editor.imageFailed'));
        return;
      }
      markDirty();
      show();
    }
    function show() {
      mount(holder, file, card[key]
        ? [cardImage(card[key], '', 'thumb'), el('button', {
            type: 'button', class: 'icon-btn', 'aria-label': t('editor.removeImage'),
            onclick: () => { card[key] = ''; markDirty(); show(); },
          }, icon('close'))]
        : el('button', {
            type: 'button', class: 'btn btn-ghost btn-image', 'aria-label': label, onclick: () => file.click(),
          }, icon('image'), t('editor.image')));
    }
    show();
    return { root: holder, attach };
  }

  /* A picture pasted in a side's field, or dropped on the side, goes there. */
  function takesPictures(field, side, picker) {
    const picture = (files) => [...(files || [])].find((one) => /^image\//.test(one.type));
    field.addEventListener('paste', (event) => {
      const found = picture(event.clipboardData && event.clipboardData.files);
      if (!found) return;
      event.preventDefault();
      picker.attach(found);
    });
    side.addEventListener('dragover', (event) => {
      if (event.dataTransfer && [...event.dataTransfer.types].includes('Files')) event.preventDefault();
    });
    side.addEventListener('drop', (event) => {
      const found = picture(event.dataTransfer && event.dataTransfer.files);
      if (!found) return;
      event.preventDefault();
      picker.attach(found);
    });
  }

  function cardRow(card, index) {
    const term = el('input', {
      type: 'text', class: 'input', value: card.term, dataset: { role: 'term' },
      placeholder: t('editor.termPlaceholder'), 'aria-label': t('common.term'),
      lang: draft.termLang || null,
      oninput: () => { card.term = term.value; markDirty(); },
    });
    const def = el('input', {
      type: 'text', class: 'input', value: card.def, dataset: { role: 'def' },
      placeholder: t('editor.defPlaceholder'), 'aria-label': t('common.definition'),
      lang: draft.defLang || null,
      oninput: () => { card.def = def.value; markDirty(); },
    });
    const hint = el('input', {
      type: 'text', class: 'input', value: card.hint, dataset: { role: 'hint' },
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

    const termPicker = imagePicker(card, 'termImage', t('editor.addTermImage'));
    const defPicker = imagePicker(card, 'defImage', t('editor.addDefImage'));
    const termSide = el('div', { class: 'editor-fields' }, term, hint, termPicker.root);
    const defSide = el('div', { class: 'editor-fields' }, def, defPicker.root);
    takesPictures(term, termSide, termPicker);
    takesPictures(def, defSide, defPicker);

    return el('div', { class: 'editor-row' },
      el('span', { class: 'idx' }, String(index + 1)),
      termSide,
      defSide,
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
    draft.cards = draft.cards.filter((card) => !unused(card));
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
    /* Unused rows are left out, but a card with one side missing, or an
       existing card that was emptied, would be dropped with its progress:
       say which one instead of saving without it. */
    const incomplete = draft.cards.findIndex((card) => !unused(card) && !complete(card));
    if (incomplete >= 0) {
      toast(t('editor.incomplete', { n: incomplete + 1 }));
      const row = list.querySelectorAll('.editor-row')[incomplete];
      const lacking = draft.cards[incomplete];
      const side = filled(lacking.term, lacking.termImage) ? 'def' : 'term';
      if (row) row.querySelector('input[data-role="' + side + '"]').focus();
      return;
    }
    /* Text and pictures come from the draft, the progress and the star from
       the store as it is now, since another tab may have moved them on. */
    const current = existing && store.getSet(existing.id);
    const live = new Map(current ? current.cards.map((card) => [card.id, card]) : []);
    const cards = draft.cards.filter(complete).map((card) => ({
      ...card, ...live.get(card.id),
      term: card.term, def: card.def, hint: card.hint, termImage: card.termImage, defImage: card.defImage,
    }));
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
    /* The set may have been deleted in another tab meanwhile: keep the draft. */
    const saved = (existing && store.updateSet(existing.id, payload)) || store.createSet(payload);
    toastSaved(t('editor.saved'));
    navigate('set/' + saved.id);
  }

  const cancel = el('button', { type: 'button', class: 'btn btn-ghost' }, t('common.cancel'));
  cancel.addEventListener('click', () => {
    if (dirty && !confirm(t('editor.discard'))) return;
    dirty = false;
    navigate(existing ? 'set/' + existing.id : '');
  });

  /* A click puts the sign where the cursor was in the last field used; the
     button never takes the focus, so the caret stays where it was. */
  let lastField = null;
  function insertSymbol(symbol) {
    if (!lastField || !lastField.isConnected) {
      toast(t('editor.symbolsNoField'));
      return;
    }
    lastField.setRangeText(symbol, lastField.selectionStart, lastField.selectionEnd, 'end');
    lastField.dispatchEvent(new Event('input', { bubbles: true }));
    lastField.focus();
  }
  const palette = el('details', { class: 'symbol-palette' },
    el('summary', {}, t('editor.symbols')),
    el('p', { class: 'field-hint' }, t('editor.symbolsHint')),
    el('div', { class: 'symbols' }, SYMBOLS.map((symbol) => el('button', {
      type: 'button', class: 'btn btn-symbol',
      onmousedown: (event) => event.preventDefault(),
      onclick: () => insertSymbol(symbol),
    }, symbol))));

  const addCard = el('button', { type: 'button', class: 'btn' }, icon('plus'), t('editor.addCard'));
  addCard.addEventListener('click', () => {
    draft.cards.push(blankCard());
    markDirty();
    paint();
    focusRow(draft.cards.length - 1);
  });

  const root = el('div', { class: 'container' },
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
      palette,
      list),

    el('section', { class: 'panel stack', style: { marginBottom: '20px' } },
      el('h2', {}, t('editor.bulk')),
      el('p', { class: 'field-hint' }, t('editor.bulkHint')),
      bulkText,
      el('div', { class: 'row' }, bulkButton)),

    el('div', { class: 'sticky-actions' },
      el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: save }, t('common.save')),
      cancel));
  root.addEventListener('focusin', (event) => {
    if (event.target.matches('input[type="text"], textarea')) lastField = event.target;
  });
  return root;
}
