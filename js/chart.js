/* Charts are built from plain elements rather than SVG: the bar thickness, the
   2px surface gaps and the hover targets then hold at any width, with no text
   scaling surprises. */

import { el, clear } from './dom.js';
import { t, formatNumber } from './i18n/index.js';

let tooltip = null;

function tooltipNode() {
  if (!tooltip) {
    tooltip = el('div', { class: 'chart-tooltip' });
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showTip(text, x, y) {
  const node = tooltipNode();
  node.textContent = text;
  node.dataset.show = '1';
  const box = node.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - box.width / 2), window.innerWidth - box.width - 8);
  const top = Math.max(8, y - box.height - 10);
  node.style.left = left + 'px';
  node.style.top = top + 'px';
}

function hideTip() {
  if (tooltip) tooltip.dataset.show = '0';
}

/* Hover and keyboard both reach the tooltip, so the figures are not locked
   behind a pointer. */
export function attachTip(node, text) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', text);
  node.addEventListener('pointerenter', (e) => showTip(text, e.clientX, e.clientY));
  node.addEventListener('pointermove', (e) => showTip(text, e.clientX, e.clientY));
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => {
    const box = node.getBoundingClientRect();
    showTip(text, box.left + box.width / 2, box.top);
  });
  node.addEventListener('blur', hideTip);
  return node;
}

export function statTile({ label, value, sub, href, title }) {
  return el(href ? 'a' : 'div', { class: 'stat-tile', href, title },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null);
}

export function meter(percent) {
  const value = Math.min(100, Math.max(0, percent));
  return el('div', {
    class: 'meter', role: 'progressbar',
    'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': '100',
  }, el('div', { class: 'meter-fill', style: { width: value + '%' } }));
}

export function tableView(headers, rows) {
  return el('details', { class: 'table-view' },
    el('summary', {}, t('stats.tableView')),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, headers.map((head, i) => el('th', { class: i ? 'num' : null }, head)))),
        el('tbody', {}, rows.map((row) => el('tr', {},
          row.map((cell, i) => el('td', { class: i ? 'num' : null }, cell))))))));
}

/* Part to whole across the four mastery levels: one ordinal blue ramp, from
   the palest step for cards still to learn to the darkest for mastered ones. */
export function masteryChart(counts, labels) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const bar = el('div', { class: 'mastery-bar' });

  if (!total) {
    bar.appendChild(el('div', { class: 'mastery-empty' }));
  } else {
    counts.forEach((count, i) => {
      if (!count) return;
      const share = (count / total) * 100;
      const segment = el('div', {
        class: 'mastery-seg',
        style: { width: share + '%', background: 'var(--viz-tier-' + (i + 1) + ')' },
      });
      attachTip(segment, labels[i] + ': ' + formatNumber(count) + ' (' + Math.round(share) + ' %)');
      bar.appendChild(segment);
    });
  }

  const legend = el('div', { class: 'legend' }, labels.map((label, i) => el('span', { class: 'legend-item' },
    el('span', { class: 'legend-swatch', style: { background: 'var(--viz-tier-' + (i + 1) + ')' } }),
    label + ' ', el('strong', {}, formatNumber(counts[i])))));

  return el('div', {}, bar, legend);
}

/* Cards answered per day. One series, so no legend: the title names it. Only
   the busiest column carries a value. */
export function activityChart(points, { label }) {
  const peak = Math.max(0, ...points.map((p) => p.count));
  const max = Math.max(1, peak);
  const columns = el('div', { class: 'chart-columns' });

  for (const point of points) {
    const height = point.count ? Math.max(3, (point.count / max) * 100) : 0;
    const fill = el('div', {
      class: 'chart-col-fill',
      dataset: point.count ? {} : { empty: '1' },
      style: { height: (point.count ? height : 2) + '%' },
    });
    const column = el('div', { class: 'chart-col' }, fill);
    attachTip(column, point.label + ': ' + label({ n: point.count }));
    columns.appendChild(column);
  }

  const plot = el('div', { class: 'chart-plot' },
    el('div', { class: 'chart-gridtop' }, el('span', { class: 'chart-axis-label' }, formatNumber(peak))),
    columns);

  const axis = el('div', { class: 'chart-xaxis' },
    el('span', {}, points[0] ? points[0].label : ''),
    el('span', {}, points.length ? points[points.length - 1].label : ''));

  return el('div', {}, plot, axis);
}

export function figure({ title, sub }, ...body) {
  return el('figure', { class: 'chart-figure' },
    el('figcaption', {},
      el('p', { class: 'chart-title' }, title),
      sub ? el('p', { class: 'chart-sub' }, sub) : null),
    ...body);
}

export function resetTooltip() {
  hideTip();
  if (tooltip) clear(tooltip);
}
