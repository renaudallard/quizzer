/* Create and edit a set. The draft is held in memory and written to the store
   only when the learner presses save. */

import { el, icon, toast, mount } from '../dom.js';
import { t, tn, getLocale } from '../i18n/index.js';
import * as store from '../store.js';
import { parseDelimited } from '../io.js';
import { navigate, onCleanup, setBusy } from '../router.js';
import { notFoundPanel, toastSaved, foldersByName } from './shared.js';
import { addImage, cardImage, IMAGE_ERRORS } from '../images.js';
import { typeset, hasMath, hasTable } from '../text.js';
import { clamp } from '../util.js';
import { diagramsEditor } from './diagrams.js';
import { richText } from '../math.js';

const LANG_CODES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'ru', 'uk', 'ar', 'tr',
  'zh', 'ja', 'ko', 'la', 'el', 'sv', 'da', 'nb', 'fi', 'cs', 'he', 'hi', 'ro', 'hu', 'vi', 'id',
];

/* Signs a keyboard lacks, for maths and science cards, by group. */
const SYMBOLS = [
  ['editor.symbolsScripts', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ₀₁₂₃₄₅₆₇₈₉₊₋ₙ'],
  ['editor.symbolsOperators', '±×÷·√≤≥≠≈≡∝°′½'],
  ['editor.symbolsAnalysis', '∑∏∫∬∮∂∇∞'],
  ['editor.symbolsSets', '∈∉⊂⊆∪∩∅ℕℤℚℝℂ∀∃¬∧∨⇒⇔'],
  ['editor.symbolsArrows', '→⇌↔↑↓'],
  ['editor.symbolsGreek', 'αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ'],
];

/* The most columns, and rows under the header, an inserted table starts
   with. More can be typed. */
const TABLE_MAX = 10;

/* Grows a field until all of its text shows. It never shrinks one, so a
   field made taller by hand stays that way. */
function fit(field) {
  if (field.scrollHeight <= field.clientHeight) return;
  field.style.height = field.scrollHeight + field.offsetHeight - field.clientHeight + 'px';
}

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

/* The folder of the set: none, one of the folders, or a new one, made at
   once with the name asked for. Giving no name keeps the choice as it was. */
const NEW_FOLDER = 'new';

function folderSelect(value, onChange) {
  const select = el('select', { class: 'select' });
  const fill = (chosen) => {
    mount(select,
      el('option', { value: '' }, t('editor.folderNone')),
      foldersByName().map((folder) => el('option', { value: folder.id }, folder.name)),
      el('option', { value: NEW_FOLDER }, t('editor.folderNew')));
    select.value = chosen;
  };
  let current = value;
  select.addEventListener('change', () => {
    if (select.value === NEW_FOLDER) {
      const name = prompt(t('folder.namePrompt'), '');
      const folder = name === null ? null : store.createFolder(name);
      if (folder) current = folder.id;
      fill(current);
    } else current = select.value;
    onChange(current);
  });
  fill(current);
  return select;
}

/* folder is the folder a new set starts in. */
export function editorView(id, folder = '') {
  const existing = id ? store.getSet(id) : null;
  if (id && !existing) return notFoundPanel(t('set.notFound'));

  const draft = existing
    ? {
        ...existing,
        cards: existing.cards.map((card) => ({ ...card })),
        diagrams: existing.diagrams.map((diagram) => ({ ...diagram, zones: diagram.zones.map((zone) => ({ ...zone })) })),
      }
    : {
        title: '', description: '', termLang: '', defLang: '',
        folder: store.getFolder(folder) ? folder : '',
        cards: [blankCard(), blankCard(), blankCard()],
        diagrams: [],
      };

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
    const input = list.querySelectorAll('.editor-row [data-role="term"]')[index];
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

  /* A side of a card, or its hint, wraps its text and grows with it, so
     nothing needs a sideways scroll, and its corner makes it taller. Enter
     starts a new line, which the card keeps. */
  function cardField(card, role, label, placeholder, lang) {
    const field = el('textarea', {
      class: 'input card-field', rows: '1', dataset: { role },
      placeholder, 'aria-label': label, lang: lang || null,
      oninput: () => { card[role] = field.value; markDirty(); fit(field); },
    });
    field.value = card[role];
    return field;
  }

  /* What the LaTeX and the tables of a field look like, under it, while
     it is typed. */
  function preview(field) {
    const box = el('div', { class: 'math-preview', 'aria-hidden': 'true' });
    const show = () => mount(box, hasMath(field.value) || hasTable(field.value) ? richText(field.value) : null);
    field.addEventListener('input', show);
    show();
    return box;
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
    const term = cardField(card, 'term', t('common.term'), t('editor.termPlaceholder'), draft.termLang);
    const def = cardField(card, 'def', t('common.definition'), t('editor.defPlaceholder'), draft.defLang);
    const hint = cardField(card, 'hint', t('common.hint'), t('editor.hintPlaceholder'), '');

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
    const termSide = el('div', { class: 'editor-fields' },
      term, preview(term), hint, preview(hint), termPicker.root);
    const defSide = el('div', { class: 'editor-fields' }, def, preview(def), defPicker.root);
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

  /* The fields can only be measured once they are on the page, which
     happens after this when the editor is first built. */
  function paint() {
    mount(list, draft.cards.map(cardRow));
    queueMicrotask(() => { for (const field of list.querySelectorAll('.card-field')) fit(field); });
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
      if (row) row.querySelector('[data-role="' + side + '"]').focus();
      return;
    }
    if (!pictures.check()) return;
    /* Text and pictures come from the draft, the progress and the star from
       the store as it is now, since another tab may have moved them on. */
    const current = existing && store.getSet(existing.id);
    const live = new Map(current ? current.cards.map((card) => [card.id, card]) : []);
    const cards = draft.cards.filter(complete).map((card) => ({
      ...card, ...live.get(card.id),
      term: card.term, def: card.def, hint: card.hint, termImage: card.termImage, defImage: card.defImage,
    }));
    if (!cards.length && !draft.diagrams.length) {
      toast(t('editor.needCard'));
      return;
    }
    dirty = false;
    const payload = {
      title: draft.title,
      description: draft.description.trim(),
      termLang: draft.termLang,
      defLang: draft.defLang,
      folder: draft.folder,
      cards,
      diagrams: draft.diagrams,
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

  /* A click puts its text where the cursor was in the last field used,
     the cursor then caret characters into it. The buttons never take the
     focus, so the caret stays where it was. */
  let lastField = null;
  function insertText(text, caret = text.length) {
    const field = lastField;
    const at = field.selectionStart;
    field.setRangeText(text, at, field.selectionEnd);
    field.setSelectionRange(at + caret, at + caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  }
  function insertSymbol(symbol) {
    if (!lastField || !lastField.isConnected) {
      toast(t('editor.symbolsNoField'));
      return;
    }
    insertText(symbol);
  }
  const palette = el('details', { class: 'symbol-palette' },
    el('summary', {}, t('editor.symbols')),
    el('p', { class: 'field-hint' }, t('editor.symbolsHint')),
    SYMBOLS.map(([label, symbols]) => el('div', { class: 'symbol-group' },
      el('h3', {}, t(label)),
      el('div', { class: 'symbols' }, [...symbols].map((symbol) => el('button', {
        type: 'button', class: 'btn btn-symbol',
        onmousedown: (event) => event.preventDefault(),
        onclick: () => insertSymbol(symbol),
      }, symbol))))));

  /* An empty table goes on lines of its own, and only in a card's fields,
     since the title and the description hold a single line and the bulk
     lines would read it as cards. The cursor lands in its first cell. */
  const tableSize = () => el('input', { type: 'number', class: 'input', min: '1', max: String(TABLE_MAX), value: '2' });
  const tableColumns = tableSize();
  const tableRows = tableSize();
  function insertTable() {
    if (!lastField || !lastField.isConnected || !lastField.dataset.role) {
      toast(t('editor.tableNoField'));
      return;
    }
    const size = (input) => clamp(Math.round(Number(input.value)) || 1, 1, TABLE_MAX);
    const row = (cell) => '|' + (' ' + cell + ' |').repeat(size(tableColumns));
    const { value, selectionStart: start, selectionEnd: end } = lastField;
    const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const after = end < value.length && value[end] !== '\n' ? '\n' : '';
    const lines = [row(''), row('---'), ...Array.from({ length: size(tableRows) }, () => row(''))];
    insertText(before + lines.join('\n') + after, before.length + 2);
  }
  const sizeField = (label, input) => el('label', { class: 'field table-size' }, el('span', {}, t(label)), input);
  const tablePanel = el('details', { class: 'symbol-palette' },
    el('summary', {}, t('editor.table')),
    el('p', { class: 'field-hint' }, t('editor.tableHint')),
    el('div', { class: 'row table-tools' },
      sizeField('editor.tableColumns', tableColumns),
      sizeField('editor.tableRows', tableRows),
      el('button', {
        type: 'button', class: 'btn',
        onmousedown: (event) => event.preventDefault(),
        onclick: insertTable,
      }, icon('table'), t('editor.tableInsert'))));

  const pictures = diagramsEditor(draft.diagrams, markDirty);

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
      el('label', { class: 'field' },
        el('span', {}, t('editor.folder')),
        folderSelect(draft.folder, (value) => {
          if (value !== draft.folder) markDirty();
          draft.folder = value;
        })),
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
      tablePanel,
      list),

    pictures.root,

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
  /* The keyboard notation of a card or of the bulk lines is written with
     its signs once the field is left, so x^2 becomes x². */
  root.addEventListener('change', (event) => {
    const field = event.target;
    if (!field.matches('input[data-role], textarea')) return;
    const value = typeset(field.value);
    if (value === field.value) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return root;
}
