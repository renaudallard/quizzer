/* Match: a grid of terms and definitions to pair against the clock. Six pairs
   per round keeps the grid readable on a phone. */

import { el, icon, mount, toast } from '../dom.js';
import { t, tn } from '../i18n/index.js';
import * as store from '../store.js';
import { shuffle, sample, formatDuration } from '../util.js';
import { studyShell, summaryPanel, saveSession, cardText } from '../study.js';
import { onCleanup } from '../router.js';
import { notFoundPanel, messagePanel } from '../views/shared.js';

const PAIRS_PER_ROUND = 6;
const MISS_FLASH_MS = 550;

export function matchView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));
  if (set.cards.length < 4) return messagePanel(t('mode.match'), t('match.tooFew'), '#/set/' + set.id);

  const shell = studyShell({ set, modeKey: 'mode.match' });
  const stage = el('div');
  const timerLabel = el('span', { class: 'match-timer' }, '0:00');
  shell.body.appendChild(stage);

  let run = null;
  let ticker = 0;
  let flashTimer = 0;

  onCleanup(() => {
    clearInterval(ticker);
    clearTimeout(flashTimer);
  });

  function stopClock() {
    clearInterval(ticker);
    ticker = 0;
  }

  function elapsed() {
    if (!run || !run.startedAt) return 0;
    return (run.endedAt || Date.now()) - run.startedAt;
  }

  function tick() {
    timerLabel.textContent = formatDuration(elapsed());
  }

  function begin() {
    const pairs = sample(set.cards, Math.min(PAIRS_PER_ROUND, set.cards.length));
    const tiles = shuffle(pairs.flatMap((card) => ([
      { key: card.id + ':term', cardId: card.id, side: 'term', text: card.term, lang: set.termLang },
      { key: card.id + ':def', cardId: card.id, side: 'def', text: card.def, lang: set.defLang },
    ])));
    run = { pairs, tiles, matched: new Set(), picked: null, locked: false, startedAt: 0, endedAt: 0 };
    timerLabel.textContent = '0:00';
    paint();
  }

  function pick(tile, button) {
    if (!run || run.locked || run.matched.has(tile.key)) return;

    if (!run.startedAt) {
      run.startedAt = Date.now();
      ticker = setInterval(tick, 200);
    }

    if (!run.picked) {
      run.picked = { tile, button };
      button.dataset.state = 'picked';
      return;
    }

    if (run.picked.tile.key === tile.key) {
      run.picked.button.dataset.state = '';
      run.picked = null;
      return;
    }

    const first = run.picked;
    const paired = first.tile.cardId === tile.cardId && first.tile.side !== tile.side;
    run.picked = null;

    if (paired) {
      run.matched.add(first.tile.key);
      run.matched.add(tile.key);
      first.button.dataset.state = 'hit';
      button.dataset.state = 'hit';
      first.button.disabled = true;
      button.disabled = true;
      shell.setProgress(run.matched.size / 2, run.pairs.length);
      if (run.matched.size === run.tiles.length) finish();
      return;
    }

    run.locked = true;
    first.button.dataset.state = 'miss';
    button.dataset.state = 'miss';
    flashTimer = setTimeout(() => {
      first.button.dataset.state = '';
      button.dataset.state = '';
      run.locked = false;
    }, MISS_FLASH_MS);
  }

  function finish() {
    run.endedAt = Date.now();
    stopClock();
    tick();
    const ms = elapsed();
    const pairs = run.pairs.length;
    const best = store.recordBestMatch(set.id, ms);
    saveSession(set.id, { mode: 'match', total: pairs, correct: pairs, ms });
    run = null;
    if (best) toast(t('match.newBest'));

    mount(stage, summaryPanel({
      score: formatDuration(ms),
      scoreLabel: t('match.doneBody', { pairs, time: formatDuration(ms) }),
      title: t('match.doneTitle'),
      actions: [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: begin }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
      ],
    }));
  }

  function paint() {
    shell.setProgress(0, run.pairs.length);
    const grid = el('div', { class: 'match-grid' });
    for (const tile of run.tiles) {
      const button = el('button', { type: 'button', class: 'match-tile' },
        cardText(tile.text, tile.lang));
      button.addEventListener('click', () => pick(tile, button));
      grid.appendChild(button);
    }

    mount(stage,
      el('div', { class: 'row-between', style: { marginBottom: '16px' } },
        el('div', {},
          el('p', { class: 'chart-sub', style: { margin: '0' } }, t('match.time')),
          timerLabel),
        el('div', { style: { textAlign: 'right' } },
          el('p', { class: 'chart-sub', style: { margin: '0' } }, tn('count.pairs', run.pairs.length)),
          set.bestMatchMs !== null
            ? el('span', { class: 'chip' }, t('match.best', { time: formatDuration(set.bestMatchMs) }))
            : null)),
      grid,
      el('p', { class: 'flashcard-foot', style: { textAlign: 'center', marginTop: '16px' } }, t('match.intro')));
  }

  begin();
  return shell.root;
}
