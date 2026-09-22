/* Leitner boxes. A card climbs one box per success and falls back to the first
   box on a miss, so the cards you keep forgetting keep coming back. */

import { startOfDay, addDays } from './util.js';

export const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];
export const MAX_BOX = INTERVALS_DAYS.length - 1;

export function schedule(box, correct, now = Date.now()) {
  const next = correct ? Math.min(box + 1, MAX_BOX) : 0;
  return { box: next, due: addDays(startOfDay(now), INTERVALS_DAYS[next]) };
}

export function isDue(card, now = Date.now()) {
  return (card.due || 0) <= now;
}

export function dueCards(cards, now = Date.now()) {
  return cards.filter((card) => isDue(card, now));
}

/* Four reading levels for the interface, folded from the six boxes so the
   mastery chart stays legible. */
export const TIERS = [
  { key: 'stats.tier.new', boxes: [0] },
  { key: 'stats.tier.learning', boxes: [1, 2] },
  { key: 'stats.tier.familiar', boxes: [3, 4] },
  { key: 'stats.tier.mastered', boxes: [5] },
];

export function tierOf(card) {
  const box = card.box || 0;
  if (box >= MAX_BOX) return 3;
  if (box >= 3) return 2;
  if (box >= 1) return 1;
  return 0;
}

export function tierCounts(cards) {
  const counts = [0, 0, 0, 0];
  for (const card of cards) counts[tierOf(card)]++;
  return counts;
}

/* Share of the total climb already done, across the whole set. */
export function masteryPct(cards) {
  if (!cards.length) return 0;
  const climbed = cards.reduce((sum, card) => sum + Math.min(card.box || 0, MAX_BOX), 0);
  return Math.round((climbed / (cards.length * MAX_BOX)) * 100);
}

export function nextDueInDays(card, now = Date.now()) {
  const days = Math.round(((card.due || 0) - startOfDay(now)) / 86400000);
  return Math.max(0, days);
}
