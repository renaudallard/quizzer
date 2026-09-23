/* The whole application state lives under one localStorage key and is written
   back on every change. The data is small, so there is nothing to optimise. */

import { uid, dayKey, lastDayKeys, addDays, clamp, pct } from './util.js';
import { schedule, isDue, MAX_BOX } from './srs.js';

export const STORAGE_KEY = 'quizzer.v1';
export const SALVAGE_KEY = 'quizzer.v1.unreadable';
const MAX_SESSIONS = 200;
const ACTIVITY_DAYS = 400;
const SESSION_MODES = ['quiz', 'learn', 'write', 'match', 'review'];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const GOAL_RANGE = { min: 5, max: 200 };

export const DEFAULT_SETTINGS = {
  locale: null,
  theme: 'system',
  accents: true,
  typos: true,
  speech: true,
  goal: 20,
};

function emptyState() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, sets: [], activity: {}, sessions: [] };
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeCard(raw) {
  return {
    id: str(raw && raw.id) || uid(),
    term: str(raw && raw.term).trim(),
    def: str(raw && raw.def).trim(),
    hint: str(raw && raw.hint).trim(),
    /* Ids of pictures kept by images.js; a side may be a picture alone. */
    termImage: str(raw && raw.termImage),
    defImage: str(raw && raw.defImage),
    star: Boolean(raw && raw.star),
    box: clamp(Math.round(num(raw && raw.box)), 0, MAX_BOX),
    due: Math.max(0, Math.round(num(raw && raw.due))),
    seen: Math.max(0, Math.round(num(raw && raw.seen))),
    correct: Math.max(0, Math.round(num(raw && raw.correct))),
    lapses: Math.max(0, Math.round(num(raw && raw.lapses))),
  };
}

export function normalizeSet(raw) {
  const now = Date.now();
  const cards = Array.isArray(raw && raw.cards) ? raw.cards.map(normalizeCard) : [];
  return {
    id: str(raw && raw.id) || uid(),
    title: str(raw && raw.title).trim() || 'Sans titre',
    description: str(raw && raw.description).trim(),
    termLang: str(raw && raw.termLang),
    defLang: str(raw && raw.defLang),
    bestMatchMs: raw && Number.isFinite(raw.bestMatchMs) ? raw.bestMatchMs : null,
    created: num(raw && raw.created, now),
    updated: num(raw && raw.updated, now),
    cards: cards.filter((card) => card.term || card.def || card.termImage || card.defImage),
  };
}

/* Known keys only, laid over base, each only with the type of its default:
   a switch takes a boolean, so "false" in a file cannot turn one on, and the
   language a string. A null value means "never chosen" and leaves the base
   value alone, and so does a goal that is not a number. */
function normalizeSettings(raw, base = DEFAULT_SETTINGS) {
  const settings = { ...base };
  if (raw && typeof raw === 'object') {
    for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
      const value = raw[key];
      if (value === undefined || value === null) continue;
      if (typeof value === (fallback === null ? 'string' : typeof fallback)) settings[key] = value;
    }
  }
  settings.goal = clamp(Math.round(num(settings.goal, base.goal)), GOAL_RANGE.min, GOAL_RANGE.max);
  return settings;
}

/* Every field is checked: the stats page formats these values, and a date it
   cannot read would stop it rendering. */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.setId !== 'string') return null;
  if (!SESSION_MODES.includes(raw.mode)) return null;
  if (typeof raw.at !== 'number' || Number.isNaN(new Date(raw.at).getTime())) return null;
  const count = (value) => Math.max(0, Math.round(num(value)));
  return {
    id: raw.id, setId: raw.setId, at: raw.at, mode: raw.mode,
    total: count(raw.total), correct: count(raw.correct), ms: count(raw.ms),
  };
}

function normalizeActivity(raw) {
  const activity = {};
  if (!raw || typeof raw !== 'object') return activity;
  for (const [key, value] of Object.entries(raw)) {
    if (DAY_KEY.test(key) && Number.isFinite(value) && value > 0) activity[key] = Math.round(value);
  }
  return activity;
}

function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: 1,
    settings: normalizeSettings(raw.settings),
    sets: Array.isArray(raw.sets) ? raw.sets.map(normalizeSet) : [],
    activity: normalizeActivity(raw.activity),
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions.map(normalizeSession).filter(Boolean).slice(-MAX_SESSIONS)
      : [],
  };
}

let state = emptyState();

/* Set when the stored payload could neither be read nor copied aside: saving
   over it would destroy the only copy, so nothing is written this visit. */
let locked = false;

/* True while changes cannot be written, so the page can say so instead of
   reporting success while nothing persists. */
let unsavedChanges = false;
const unsavedWatchers = new Set();

function setUnsaved(value) {
  if (unsavedChanges === value) return;
  unsavedChanges = value;
  for (const fn of unsavedWatchers) fn(value);
}

export function unsaved() {
  return unsavedChanges;
}

export function onUnsavedChange(fn) {
  unsavedWatchers.add(fn);
  return () => unsavedWatchers.delete(fn);
}

function readable(parsed) {
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && (parsed.sets === undefined || Array.isArray(parsed.sets));
}

export function load() {
  locked = false;
  setUnsaved(false);
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* Storage is blocked: nothing will be kept, and the page should say so. */
    state = emptyState();
    setUnsaved(true);
    return state;
  }
  if (!raw) {
    state = emptyState();
    return state;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (readable(parsed)) {
    state = normalizeState(parsed);
    return state;
  }
  /* Keep a payload we cannot read aside rather than overwrite it blindly. */
  try {
    localStorage.setItem(SALVAGE_KEY, raw);
  } catch {
    locked = true;
    setUnsaved(true);
  }
  state = emptyState();
  return state;
}

export function save() {
  let ok = false;
  if (!locked) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      ok = true;
    } catch {
      ok = false;
    }
  }
  setUnsaved(!ok);
  return ok;
}

export function getSettings() {
  return state.settings;
}

/* Goes through the same rules as a loaded state, so the goal is rounded and
   kept in range whichever page sets it. Returns the value actually kept. */
export function setSetting(key, value) {
  state.settings = normalizeSettings({ [key]: value }, state.settings);
  save();
  return state.settings[key];
}

export function getSets() {
  return state.sets;
}

export function getSet(id) {
  return state.sets.find((set) => set.id === id) || null;
}

export function createSet(data) {
  const set = normalizeSet({ ...data, id: uid(), created: Date.now(), updated: Date.now() });
  state.sets.unshift(set);
  save();
  return set;
}

/* Goes through the same rules as a new or loaded set, so the text is trimmed
   and every card keeps its full shape. */
export function updateSet(id, patch) {
  const set = getSet(id);
  if (!set) return null;
  Object.assign(set, normalizeSet({ ...set, ...patch, id: set.id, updated: Date.now() }));
  save();
  return set;
}

export function deleteSet(id) {
  const index = state.sets.findIndex((set) => set.id === id);
  if (index < 0) return false;
  state.sets.splice(index, 1);
  state.sessions = state.sessions.filter((entry) => entry.setId !== id);
  save();
  return true;
}

/* Every picture a card uses, so the others can be let go. */
export function imageIds() {
  const ids = new Set();
  for (const set of state.sets) {
    for (const card of set.cards) {
      if (card.termImage) ids.add(card.termImage);
      if (card.defImage) ids.add(card.defImage);
    }
  }
  return ids;
}

export function getCard(setId, cardId) {
  const set = getSet(setId);
  return set ? set.cards.find((card) => card.id === cardId) || null : null;
}

export function toggleStar(setId, cardId) {
  const card = getCard(setId, cardId);
  if (!card) return false;
  card.star = !card.star;
  save();
  return card.star;
}

/* One graded answer: moves the card between boxes, keeps its counters and adds
   a tick to today's activity. */
export function recordAnswer(setId, cardId, correct) {
  const set = getSet(setId);
  const card = set && set.cards.find((entry) => entry.id === cardId);
  if (!card) return null;

  /* Only a card that is due climbs: getting it right again before then is
     practice, which must not push it to a longer interval. A miss always
     counts, since forgetting is news whenever it happens. */
  if (!correct || isDue(card)) {
    const next = schedule(card.box, correct);
    card.box = next.box;
    card.due = next.due;
  }
  card.seen += 1;
  if (correct) card.correct += 1;
  else card.lapses += 1;

  const key = dayKey();
  state.activity[key] = (state.activity[key] || 0) + 1;
  pruneActivity();

  set.updated = Date.now();
  save();
  return card;
}

/* Old days go, but never the ones the current streak is counted from, or a
   streak could not grow past the kept window. */
function pruneActivity() {
  const keys = Object.keys(state.activity);
  if (keys.length <= ACTIVITY_DAYS) return;
  const keep = new Set(lastDayKeys(Math.max(ACTIVITY_DAYS, streak() + 1)));
  for (const key of keys) if (!keep.has(key)) delete state.activity[key];
}

export function recordSession(setId, entry) {
  state.sessions.push({ id: uid(), setId, at: Date.now(), ...entry });
  if (state.sessions.length > MAX_SESSIONS) state.sessions = state.sessions.slice(-MAX_SESSIONS);
  save();
}

export function getSessions(setId) {
  return state.sessions.filter((entry) => entry.setId === setId).slice().reverse();
}

export function recordBestMatch(setId, ms) {
  const set = getSet(setId);
  if (!set) return false;
  if (set.bestMatchMs === null || ms < set.bestMatchMs) {
    set.bestMatchMs = ms;
    save();
    return true;
  }
  return false;
}

export function activityFor(days) {
  return lastDayKeys(days).map((key) => ({ key, count: state.activity[key] || 0 }));
}

/* Consecutive days with at least one answer, counted back from today. A day
   that has only just begun does not break a streak earned yesterday. */
export function streak() {
  const today = dayKey();
  let cursor = state.activity[today] ? Date.now() : addDays(Date.now(), -1);
  let count = 0;
  while (state.activity[dayKey(new Date(cursor))]) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function summary(now = Date.now()) {
  let cards = 0;
  let due = 0;
  let mastered = 0;
  let seen = 0;
  let correct = 0;
  for (const set of state.sets) {
    for (const card of set.cards) {
      cards += 1;
      if (isDue(card, now)) due += 1;
      if (card.box >= MAX_BOX) mastered += 1;
      seen += card.seen;
      correct += card.correct;
    }
  }
  return {
    sets: state.sets.length,
    cards,
    due,
    mastered,
    accuracy: seen ? pct(correct, seen) : null,
    streak: streak(),
    today: state.activity[dayKey()] || 0,
  };
}

/* A full backup: the sets with each card's progress, the session history,
   the daily activity and the settings. */
export function exportAll() {
  return JSON.stringify({
    app: 'quizzer', version: 1, exported: Date.now(),
    sets: state.sets, sessions: state.sessions, activity: state.activity, settings: state.settings,
  }, null, 2);
}

/* Merges an export back in, so importing the same file twice changes nothing.
   A set already known by id is replaced and new ones go on top in file order.
   Sessions are matched by id and only kept for sets that exist. Each day keeps
   the higher of the two counts, since the same answers may be counted on both
   sides. Settings found in the file win. */
export function importPayload(payload) {
  const incoming = Array.isArray(payload && payload.sets) ? payload.sets
    : Array.isArray(payload) ? payload : null;
  if (!incoming) throw new Error('shape');
  let count = 0;
  const added = [];
  for (const raw of incoming) {
    const set = normalizeSet(raw);
    if (!set.cards.length) continue;
    const index = state.sets.findIndex((existing) => existing.id === set.id);
    if (index >= 0) state.sets[index] = set;
    else added.push(set);
    count += 1;
  }
  state.sets.unshift(...added);

  if (!Array.isArray(payload)) {
    const known = new Set(state.sessions.map((entry) => entry.id));
    const sets = new Set(state.sets.map((set) => set.id));
    const sessions = Array.isArray(payload.sessions) ? payload.sessions.map(normalizeSession) : [];
    for (const entry of sessions) {
      if (!entry || known.has(entry.id) || !sets.has(entry.setId)) continue;
      known.add(entry.id);
      state.sessions.push(entry);
    }
    state.sessions.sort((a, b) => a.at - b.at);
    state.sessions = state.sessions.slice(-MAX_SESSIONS);

    for (const [key, value] of Object.entries(normalizeActivity(payload.activity))) {
      state.activity[key] = Math.max(state.activity[key] || 0, value);
    }
    pruneActivity();

    state.settings = normalizeSettings(payload.settings, state.settings);
  }
  save();
  return count;
}

/* True while an unreadable payload sits aside, or storage cannot be read:
   the pictures its cards may use must be kept until it is dealt with. */
export function hasSalvage() {
  try {
    return localStorage.getItem(SALVAGE_KEY) !== null;
  } catch {
    return true;
  }
}

/* Erasing everything includes the copy of any payload that was set aside. */
export function resetAll() {
  state = emptyState();
  locked = false;
  setUnsaved(false);
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SALVAGE_KEY);
  } catch {
    /* nothing to clean */
  }
  return state;
}

export function storageBytes() {
  try {
    return new Blob([localStorage.getItem(STORAGE_KEY) || '', localStorage.getItem(SALVAGE_KEY) || '']).size;
  } catch {
    return 0;
  }
}
