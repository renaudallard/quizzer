/* Panels reused by several views. */

import { el, icon, toast } from '../dom.js';
import { t } from '../i18n/index.js';
import * as store from '../store.js';
import { shareUrl, copyText } from '../io.js';
import { cardImage } from '../images.js';

/* Some messaging apps cut links around this length. */
const LONG_LINK = 8000;

/* The share button, the field that shows the link when the clipboard refuses
   it, and the notes for very long links and for pictures, which a link
   cannot carry. The link is built on click from getSet(), so it carries the
   set as it is then. The copy result goes to the toast and the warnings to
   the notes, so neither hides the other. */
export function shareControls(getSet, { label, primary = false }) {
  const field = el('input', {
    type: 'text', class: 'input', readonly: true, hidden: true, 'aria-label': t('transfer.shareTitle'),
  });
  const long = el('p', { class: 'field-hint', hidden: true }, t('transfer.shareLong'));
  const pictures = el('p', { class: 'field-hint', hidden: true }, t('transfer.shareNoImages'));
  const notice = el('div', {}, long, pictures);
  const button = el('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn' }, icon('share'), label);
  button.addEventListener('click', async () => {
    const set = getSet();
    if (!set) return;
    const url = shareUrl(set);
    long.hidden = url.length <= LONG_LINK;
    pictures.hidden = !set.cards.some((card) => card.termImage || card.defImage);
    field.value = url;
    if (await copyText(url)) {
      toast(t('transfer.shareCopied'));
    } else {
      field.hidden = false;
      field.select();
      toast(t('transfer.shareFailed'));
    }
  });
  return { button, field, notice };
}

/* Confirms a change that the store has just written. While writing fails,
   the alert at the top of the page says so, and no success is announced. */
export function toastSaved(message) {
  if (!store.unsaved()) toast(message);
}

/* The way out defaults to the home page; a caller sending the learner
   elsewhere names that place too, so the button says where it goes. */
export function messagePanel(title, message, back = { href: '#/', label: t('error.goHome') }) {
  return el('div', { class: 'container container-narrow' },
    el('div', { class: 'empty' },
      el('h2', {}, title),
      el('p', {}, message),
      el('div', { class: 'empty-actions' },
        el('a', { class: 'btn btn-primary', href: back.href }, back.label))));
}

/* A small picture for lists, announced only when it stands without text. */
function thumbnail(image, text) {
  return image ? cardImage(image, text ? '' : t('image.alt'), 'thumb') : null;
}

/* One card as a row: the term with its hint and the definition, each marked
   with its language when the set declares one, so read aloud and screen
   readers pronounce them right, and each with its picture when it has one.
   tools, when given, fills the last column. */
export function cardRow(card, { termLang, defLang } = {}, tools) {
  return el('div', { class: 'card-row' },
    el('div', { class: 'term' },
      thumbnail(card.termImage, card.term),
      card.term ? el('span', { lang: termLang || null }, card.term) : null,
      card.hint ? el('span', { class: 'hint' }, card.hint) : null),
    el('div', { class: 'def' },
      thumbnail(card.defImage, card.def),
      card.def ? el('span', { lang: defLang || null }, card.def) : null),
    tools === undefined ? null : el('div', { class: 'card-row-tools' }, tools));
}

export function notFoundPanel(message) {
  return messagePanel(t('error.notFoundTitle'), message);
}
