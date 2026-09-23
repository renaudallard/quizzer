/* Flashcards: browse a set and flip each card, or sort each one as known or
   still to learn and go over the second pile. None of it is a test, so the
   spaced repetition schedule is left untouched. */

import { el, icon, toast, mount } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle } from '../util.js';
import { studyShell, flipCard, summaryPanel, bindKeys } from '../study.js';
import { notFoundPanel } from '../views/shared.js';

/* Focus reached from the keyboard, not the focus a mouse click leaves on a
   button. A browser that cannot tell the two apart counts it as keyboard
   focus, which only keeps the focus where it was. */
function keyboardFocus(node) {
  try {
    return node.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function flashcardsView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const state = { index: 0, reversed: false, shuffled: false, starredOnly: false, sorting: false };
  let order = set.cards.slice();
  /* Where each card of the pass went while sorting, by id, and the cards the
     pass is limited to after "go over the second pile", or null for all. */
  let sorted = new Map();
  let focus = null;

  const shell = studyShell({ set, modeKey: 'mode.flashcards' });
  const card = flipCard();
  const stage = el('div');
  const starButton = el('button', { type: 'button', class: 'btn toggle-btn' }, icon('star'));

  const toggle = (label, glyph, key) => {
    const button = el('button', {
      type: 'button', class: 'btn toggle-btn', 'aria-pressed': 'false',
      onclick: () => {
        state[key] = !state[key];
        button.setAttribute('aria-pressed', String(state[key]));
        rebuild();
      },
    }, glyph ? icon(glyph) : null, label);
    return button;
  };

  const shuffleButton = toggle(t('common.shuffle'), 'shuffle', 'shuffled');
  const reverseButton = toggle(t('flashcards.reverse'), 'restart', 'reversed');
  const starredButton = toggle(t('flashcards.starredOnly'), 'star', 'starredOnly');
  const sortButton = toggle(t('flashcards.sort'), 'check', 'sorting');

  function current() {
    return order[state.index] || null;
  }

  /* The page keeps its own list of cards, but reads stars from the store by
     id, since another tab may have changed them meanwhile. */
  function hasStar(entry) {
    const live = store.getCard(set.id, entry.id);
    return Boolean(live ? live.star : entry.star);
  }

  /* The second pile is a sorting matter: turning sorting off brings the
     whole set back. */
  function rebuild() {
    if (!state.sorting) focus = null;
    let cards = focus ? set.cards.filter((card) => focus.has(card.id)) : set.cards;
    if (state.starredOnly) {
      const starred = cards.filter(hasStar);
      if (!starred.length) {
        state.starredOnly = false;
        starredButton.setAttribute('aria-pressed', 'false');
        toast(t('flashcards.noStarred'));
      } else {
        cards = starred;
      }
    }
    order = state.shuffled ? shuffle(cards) : cards.slice();
    state.index = 0;
    sorted = new Map();
    paint();
  }

  function move(delta) {
    const next = state.index + delta;
    if (next < 0 || next > order.length) return;
    state.index = next;
    /* Going back while sorting takes back the sort of the card returned to. */
    if (delta < 0 && current()) sorted.delete(current().id);
    paint();
  }

  function sort(known) {
    const entry = current();
    if (!entry) return;
    sorted.set(entry.id, known);
    move(1);
  }

  /* The end of a sorted pass: what was known, and the other pile to go over. */
  function sortedSummary() {
    const learning = order.filter((entry) => sorted.get(entry.id) === false);
    const known = order.length - learning.length;
    return summaryPanel({
      score: known + '/' + order.length,
      scoreLabel: tn('flashcards.sortedBody', learning.length),
      title: t('flashcards.doneTitle'),
      actions: [
        learning.length
          ? el('button', {
              type: 'button', class: 'btn btn-primary',
              onclick: () => { focus = new Set(learning.map((entry) => entry.id)); rebuild(); },
            }, icon('restart'), tn('flashcards.studyLearning', learning.length))
          : null,
        el('button', {
          type: 'button', class: learning.length ? 'btn' : 'btn btn-primary',
          onclick: () => { focus = null; rebuild(); },
        }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
      ].filter(Boolean),
      missed: learning,
      langs: set,
    });
  }

  function paint() {
    /* Rebuilding the buttons drops the focus, so a keyboard user who pressed
       Suivant gets it back on the new Suivant rather than on the page, where
       the next Enter would turn the card instead. The focus a mouse click
       leaves behind is let go, so Space still turns the card after a click. */
    const active = document.activeElement;
    const step = stage.contains(active) && keyboardFocus(active) ? active.dataset.step : null;
    if (state.index >= order.length) {
      shell.setProgress(order.length, order.length);
      mount(stage, state.sorting ? sortedSummary() : summaryPanel({
        title: t('flashcards.doneTitle'),
        body: tn('flashcards.doneBody', order.length),
        actions: [
          el('button', { type: 'button', class: 'btn btn-primary', onclick: () => { state.index = 0; paint(); } },
            icon('restart'), t('common.restart')),
          el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
        ],
      }));
      if (step) stage.querySelector('.summary .btn-primary').focus();
      return;
    }

    const entry = current();
    const termSide = { label: t('common.term'), text: entry.term, image: entry.termImage, lang: set.termLang, hint: entry.hint };
    const defSide = { label: t('common.definition'), text: entry.def, image: entry.defImage, lang: set.defLang };
    const front = state.reversed ? defSide : termSide;
    const back = state.reversed ? termSide : defSide;

    card.setFaces(front, back);
    paintStar(hasStar(entry));

    shell.setProgress(state.index + 1, order.length);
    mount(stage,
      card.root,
      el('div', { class: 'study-nav' },
        el('button', {
          type: 'button', class: 'btn', dataset: { step: 'previous' },
          disabled: state.index === 0, onclick: () => move(-1),
        }, icon('left'), t('common.previous')),
        state.sorting
          ? [
              el('button', {
                type: 'button', class: 'btn', dataset: { step: 'learning' }, onclick: () => sort(false),
              }, icon('restart'), t('flashcards.learning')),
              el('button', {
                type: 'button', class: 'btn btn-primary', dataset: { step: 'know' }, onclick: () => sort(true),
              }, icon('check'), t('flashcards.know')),
            ]
          : el('button', {
              type: 'button', class: 'btn', dataset: { step: 'next' }, onclick: () => move(1),
            }, t('common.next'), icon('right'))),
      el('p', { class: 'flashcard-foot', style: { textAlign: 'center', marginTop: '14px' } },
        t(state.sorting ? 'flashcards.sortHint' : 'flashcards.flipHint')));
    if (step) {
      const again = stage.querySelector('[data-step="' + step + '"]:not([disabled])')
        || stage.querySelector('[data-step]:not([disabled])');
      if (again) again.focus();
    }
  }

  function paintStar(on) {
    starButton.setAttribute('aria-pressed', String(on));
    starButton.setAttribute('aria-label', on ? t('flashcards.unstar') : t('flashcards.star'));
  }

  /* Starring leaves the card as it is, turned or not. */
  starButton.addEventListener('click', () => {
    const entry = current();
    if (!entry) return;
    paintStar(store.toggleStar(set.id, entry.id));
  });

  /* While sorting, the arrows sort the card as a swipe would: left still to
     learn, right known. */
  bindKeys((event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); if (state.sorting) sort(true); else move(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); if (state.sorting) sort(false); else move(-1); }
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); card.flip(); }
    else if (event.key === 's' || event.key === 'S') starButton.click();
    else if ((event.key === 'a' || event.key === 'A') && current()) card.speak();
  });

  rebuild();

  shell.body.appendChild(el('div', { class: 'study-toolbar' },
    shuffleButton, reverseButton, starredButton, sortButton, starButton));
  shell.body.appendChild(stage);
  return shell.root;
}
