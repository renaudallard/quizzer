/* Panels reused by several views. */

import { el } from '../dom.js';
import { t } from '../i18n/index.js';

export function messagePanel(title, message, backHref = '#/') {
  return el('div', { class: 'container container-narrow' },
    el('div', { class: 'empty' },
      el('h2', {}, title),
      el('p', {}, message),
      el('div', { class: 'empty-actions' },
        el('a', { class: 'btn btn-primary', href: backHref }, t('error.goHome')))));
}

export function notFoundPanel(message) {
  return messagePanel(t('error.notFoundTitle'), message);
}

export function sectionTitle(title, sub) {
  return el('div', { class: 'panel-head' },
    el('div', {},
      el('h2', {}, title),
      sub ? el('p', { class: 'chart-sub', style: { margin: '0' } }, sub) : null));
}
