/* Per set progress: how the cards are spread across the mastery levels, how
   much work went in lately, and which cards keep slipping. */

import { el, icon } from '../dom.js';
import { t, tn, formatDate, formatDayKey, formatRelativeDays, formatPercent } from '../i18n/index.js';
import * as store from '../store.js';
import { tierCounts, TIERS, masteryPct, dueCards, nextDueInDays, tierOf } from '../srs.js';
import { statTile, masteryChart, activityChart, figure, tableView } from '../chart.js';
import { dayKey, lastDayKeys, formatDuration, pct } from '../util.js';
import { truncate } from '../text.js';
import { notFoundPanel } from './shared.js';

const ACTIVITY_DAYS = 14;
const HARDEST_LIMIT = 10;

/* Derived from the recorded sessions rather than stored twice. */
function sessionActivity(setId) {
  const byDay = new Map();
  for (const entry of store.getSessions(setId)) {
    const key = dayKey(new Date(entry.at));
    byDay.set(key, (byDay.get(key) || 0) + entry.total);
  }
  return lastDayKeys(ACTIVITY_DAYS).map((key) => ({
    key,
    count: byDay.get(key) || 0,
    label: formatDayKey(key),
  }));
}

function hardestCards(set) {
  return set.cards
    .filter((card) => card.seen > 0)
    .sort((a, b) => (b.lapses - a.lapses) || (a.correct / a.seen - b.correct / b.seen))
    .slice(0, HARDEST_LIMIT);
}

export function statsView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));

  const counts = tierCounts(set.cards);
  const labels = TIERS.map((tier) => t(tier.key));
  const due = dueCards(set.cards).length;
  const seen = set.cards.reduce((sum, card) => sum + card.seen, 0);
  const correct = set.cards.reduce((sum, card) => sum + card.correct, 0);
  const sessions = store.getSessions(set.id);
  const points = sessionActivity(set.id);

  const tiles = el('section', { class: 'kpi-row' },
    statTile({ label: t('stat.cards'), value: set.cards.length, sub: t('set.progress', { p: masteryPct(set.cards) }) }),
    statTile({ label: t('stat.due'), value: due, sub: t('stat.dueSub') }),
    statTile({
      label: t('stat.accuracy'),
      value: seen ? formatPercent(pct(correct, seen)) : '–',
      sub: t('stat.accuracySub'),
    }),
    statTile({ label: t('stat.mastered'), value: counts[3], sub: t('stat.masteredSub') }),
    set.bestMatchMs !== null
      ? statTile({ label: t('mode.match'), value: formatDuration(set.bestMatchMs), sub: t('match.time') })
      : null);

  const mastery = el('section', { class: 'panel', style: { marginBottom: '20px' } },
    figure({ title: t('stats.masteryTitle'), sub: tn('stats.masterySub', set.cards.length) },
      masteryChart(counts, labels),
      tableView([t('stats.col.level'), t('stats.col.count')],
        labels.map((label, i) => [label, String(counts[i])]))));

  const hasActivity = points.some((point) => point.count > 0);
  const activity = el('section', { class: 'panel', style: { marginBottom: '20px' } },
    figure({ title: t('stats.activityTitle'), sub: t('stats.activitySub') },
      hasActivity
        ? el('div', {},
            activityChart(points, { label: (vars) => tn('count.cards', vars.n) }),
            tableView([t('stats.col.date'), t('stats.col.count')],
              points.filter((point) => point.count).map((point) => [point.label, String(point.count)])))
        : el('p', { class: 'chart-sub' }, t('stats.noData'))));

  const hardest = hardestCards(set);
  const hardestPanel = el('section', { class: 'panel', style: { marginBottom: '20px' } },
    figure({ title: t('stats.hardestTitle'), sub: t('stats.hardestSub') },
      hardest.length
        ? el('div', { class: 'table-wrap' },
            el('table', { class: 'table' },
              el('thead', {}, el('tr', {},
                el('th', {}, t('stats.col.card')),
                el('th', { class: 'num' }, t('stats.col.seen')),
                el('th', { class: 'num' }, t('stats.col.accuracy')),
                el('th', { class: 'num' }, t('stats.col.lapses')),
                el('th', { class: 'num' }, t('stats.col.level')),
                el('th', { class: 'num' }, t('stats.col.due')))),
              el('tbody', {}, hardest.map((card) => el('tr', {},
                el('td', {}, truncate(card.term, 42)),
                el('td', { class: 'num' }, String(card.seen)),
                el('td', { class: 'num' }, formatPercent(pct(card.correct, card.seen))),
                el('td', { class: 'num' }, String(card.lapses)),
                el('td', { class: 'num' }, t(TIERS[tierOf(card)].key)),
                el('td', { class: 'num' }, formatRelativeDays(nextDueInDays(card))))))))
        : el('p', { class: 'chart-sub' }, t('stats.hardestEmpty'))));

  const sessionPanel = el('section', { class: 'panel' },
    figure({ title: t('stats.sessionsTitle') },
      sessions.length
        ? el('div', { class: 'table-wrap' },
            el('table', { class: 'table' },
              el('thead', {}, el('tr', {},
                el('th', {}, t('stats.col.date')),
                el('th', {}, t('stats.col.mode')),
                el('th', { class: 'num' }, t('stats.col.score')),
                el('th', { class: 'num' }, t('match.time')))),
              el('tbody', {}, sessions.slice(0, 12).map((entry) => el('tr', {},
                el('td', {}, formatDate(entry.at, 'short')),
                el('td', {}, t('mode.' + entry.mode)),
                el('td', { class: 'num' }, entry.correct + '/' + entry.total),
                el('td', { class: 'num' }, formatDuration(entry.ms || 0)))))))
        : el('p', { class: 'chart-sub' }, t('stats.sessionsEmpty'))));

  return el('div', { class: 'container' },
    el('div', { class: 'study-head', style: { marginBottom: '18px' } },
      el('a', { class: 'icon-btn', href: '#/set/' + set.id, 'aria-label': t('common.back') }, icon('back')),
      el('h1', {}, t('mode.stats'))),
    el('p', { class: 'chart-sub' }, set.title),
    tiles, mastery, activity, hardestPanel, sessionPanel);
}
