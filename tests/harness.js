/* Self contained smoke test. Open tests/harness.html from the same server that
   serves the app. The learner's own data is saved aside and put back, so the
   run is safe on a browser that already holds real sets. */

import * as store from '../js/store.js';
import * as srs from '../js/srs.js';
import * as io from '../js/io.js';
import * as text from '../js/text.js';
import * as i18n from '../js/i18n/index.js';
import { initTheme } from '../js/theme.js';
import { teardown } from '../js/router.js';

import { homeView } from '../js/views/home.js';
import { setView } from '../js/views/set.js';
import { editorView } from '../js/views/editor.js';
import { statsView } from '../js/views/stats.js';
import { settingsView, shortcutsView } from '../js/views/settings.js';
import { transferView, sharedView } from '../js/views/transfer.js';
import { flashcardsView } from '../js/modes/flashcards.js';
import { reviewView } from '../js/modes/review.js';
import { quizView } from '../js/modes/quiz.js';
import { writeView } from '../js/modes/write.js';
import { matchView } from '../js/modes/match.js';

/* Both keys the app writes, its state and the copy of a payload it could not
   read, are set aside for the run. */
const KEYS = [store.STORAGE_KEY, store.SALVAGE_KEY];
const results = document.getElementById('results');
const summary = document.getElementById('summary');
const main = document.getElementById('main');

let passed = 0;
let failed = 0;

function row(tag, name, detail) {
  const line = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = 'tag tag-' + tag.toLowerCase();
  badge.textContent = tag;
  line.append(badge, ' ' + name);
  if (detail) {
    const note = document.createElement('span');
    note.className = 'detail';
    note.textContent = '  ' + detail;
    line.append(note);
  }
  results.appendChild(line);
}

function check(name, fn) {
  try {
    const detail = fn();
    row('PASS', name, detail);
    passed++;
  } catch (error) {
    row('FAIL', name, String(error && error.message ? error.message : error));
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

/* Finds a stat tile by its label and returns its figure, caption and link. */
function statTileIn(node, label) {
  const tile = [...node.querySelectorAll('.stat-tile')]
    .find((candidate) => candidate.querySelector('.stat-label').textContent === label);
  assert(tile, 'tuile absente: ' + label);
  return {
    value: tile.querySelector('.stat-value').textContent,
    sub: tile.querySelector('.stat-sub').textContent,
    link: tile.getAttribute('href'),
  };
}

const VIEWS = {
  home: homeView, set: setView, editor: editorView, stats: statsView,
  settings: settingsView, shortcuts: shortcutsView, transfer: transferView,
  shared: sharedView, flashcards: flashcardsView, review: reviewView,
  quiz: quizView, write: writeView, match: matchView,
};

async function run() {
  i18n.setLocale('fr');
  initTheme();
  for (const key of KEYS) localStorage.removeItem(key);
  store.load();

  const samples = await (await fetch('../data/samples.json')).json();
  check('charge les jeux d’exemple', () => {
    const count = store.importPayload(samples);
    assert(count === samples.sets.length, 'attendu ' + samples.sets.length + ', obtenu ' + count);
    return count + ' jeux';
  });

  const set = store.getSet('sample-es-base');
  check('le jeu est complet', () => {
    assert(set && set.cards.length === 30, 'cartes manquantes');
    return set.cards.length + ' cartes';
  });

  check('aller retour avec le stockage', () => {
    store.save();
    store.load();
    assert(store.getSets().length === samples.sets.length, 'jeux perdus');
    assert(store.getSet('sample-es-base').cards.length === 30, 'cartes perdues');
    return 'ok';
  });

  check('l’échelle de Leitner monte et retombe', () => {
    const card = store.getSet(set.id).cards[0];
    assert(srs.isDue(card), 'une carte neuve doit être due');
    store.recordAnswer(set.id, card.id, true);
    assert(card.box === 1, 'boîte ' + card.box);
    assert(!srs.isDue(card), 'ne doit plus être due après une réussite');
    store.recordAnswer(set.id, card.id, true);
    assert(card.box === 1, 'une réussite avant l’échéance ne doit pas la faire monter');
    store.recordAnswer(set.id, card.id, false);
    assert(card.box === 0 && srs.isDue(card), 'un échec doit la ramener aujourd’hui');
    return 'vues=' + card.seen + ' oublis=' + card.lapses;
  });

  check('correction des réponses écrites', () => {
    assert(text.grade('ecole', 'école').verdict === 'correct', 'accent');
    assert(text.grade('ecolle', 'école').verdict === 'almost', 'faute de frappe');
    assert(text.grade('chat', 'école').verdict === 'wrong', 'réponse fausse');
    assert(text.grade('ecole', 'école', { accents: false }).verdict === 'almost', 'accents stricts');
    assert(text.grade('auto', 'voiture / auto').verdict === 'correct', 'variante');
    assert(text.grade('Romes', 'Rome').verdict === 'wrong', 'mot court rallongé');
    assert(text.grade('Pari', 'Paris').verdict === 'almost', 'lettre oubliée');
    assert(text.grade('ordinatr', 'ordinateur').verdict === 'almost', 'deux fautes sur un mot long');
    assert(text.grade('km/h', 'km/h').verdict === 'correct', 'réponse entière avec une barre');
    assert(text.grade('h', 'km/h').verdict === 'wrong', 'morceau de réponse');
    assert(text.grade('collègue', 'collègue (m/f)').verdict === 'correct', 'précision entre parenthèses');
    assert(text.grade('coeur', 'cœur').verdict === 'correct', 'ligature');
    assert(text.grade('leau', 'l’eau').verdict === 'correct', 'apostrophe omise');
    assert(text.grade('bonjour', '« bonjour »').verdict === 'correct', 'guillemets');
    assert(text.grade('?', '?').verdict === 'correct', 'ponctuation seule');
    assert(text.grade('C', 'C#').verdict === 'wrong', 'symbole qui compte');
    assert(text.grade('314', '3,14').verdict === 'wrong', 'virgule décimale oubliée');
    assert(text.grade('3.14', '3,14').verdict === 'correct', 'point pour virgule');
    assert(text.grade('1000', '1 000').verdict === 'correct', 'espace des milliers');
    assert(text.grade('5', '-5').verdict === 'wrong', 'signe moins oublié');
    assert(text.grade('2x+1', '2(x+1)').verdict === 'wrong', 'parenthèses d’une formule');
    assert(text.grade('xy', 'x-y').verdict === 'wrong', 'signe moins d’une formule');
    assert(text.grade('2 ( x + 1 )', '2(x+1)').verdict === 'correct', 'espaces dans une formule');
    return 'ok';
  });

  check('lien de partage aller retour', () => {
    const payload = io.shareUrl(set).split('#/shared/')[1];
    const back = io.decodeShare(payload);
    assert(back && back.cards.length === set.cards.length, 'cartes perdues');
    assert(back.cards[0].term === set.cards[0].term, 'terme perdu');
    return payload.length + ' caractères';
  });

  check('CSV aller retour', () => {
    const parsed = io.parseDelimited(io.toCSV(set));
    assert(parsed.length === set.cards.length, parsed.length + ' au lieu de ' + set.cards.length);
    assert(parsed[0].def === set.cards[0].def, 'définition perdue');
    for (const header of ['terme;définition', 'term;definition', 'begrip;betekenis']) {
      assert(io.parseDelimited(header + '\nhond;chien').length === 1, 'en-tête pris pour une carte: ' + header);
    }
    assert(io.parseDelimited('chat,"cat; kitty"\nchien,dog').length === 2, 'séparateur entre guillemets');
    assert(io.parseDelimited('  # notes; x\nhola\tbonjour').length === 1, 'commentaire en retrait');
    assert(io.parseDelimited('\t\nhola;bonjour').length === 1, 'ligne de tabulations seules');
    assert(io.parseDelimited('être,to be; to exist\navoir,to have').length === 2, 'point-virgule dans une définition');
    const hashed = { cards: [{ term: '#include', def: 'directive', hint: '' }] };
    assert(io.parseDelimited(io.toCSV(hashed))[0]?.term === '#include', 'terme commençant par #');
    return 'ok';
  });

  const utf8 = await io.readText(new Blob(['\ufeffterme;définition\nécole;school\n']));
  const legacy = await io.readText(new Blob([Uint8Array.from('café;coffee', (char) => char.charCodeAt(0))]));
  /* UTF-16 little endian with its byte order mark; every character here fits
     in the low byte. */
  const wideBytes = [0xff, 0xfe];
  for (const char of 'café;coffee') wideBytes.push(char.charCodeAt(0), 0);
  const wide = await io.readText(new Blob([new Uint8Array(wideBytes)]));
  check('lecture des fichiers CSV', () => {
    assert(utf8 === 'terme;définition\nécole;school\n', 'UTF-8: ' + JSON.stringify(utf8));
    assert(legacy === 'café;coffee', 'Windows-1252: ' + JSON.stringify(legacy));
    assert(wide === 'café;coffee', 'UTF-16: ' + JSON.stringify(wide));
    return 'UTF-8, UTF-16 et Windows-1252';
  });

  const reference = i18n.CATALOGS[i18n.DEFAULT_LOCALE];
  const keys = Object.keys(reference);
  for (const { code: locale } of i18n.LOCALES) {
    for (const [name, view] of Object.entries(VIEWS)) {
      /* A key found in no catalogue reaches the screen raw, and a variable
         the call forgot stays as {name}: both fail here. */
      check(`vue ${name} [${locale}]`, () => {
        i18n.setLocale(locale);
        i18n.missingKeys.clear();
        const arg = name === 'shared' ? io.encodeShare(set) : name === 'editor' ? null : set.id;
        const node = view(arg);
        assert(node instanceof Element, 'pas un élément');
        assert(node.textContent.trim(), 'rendu vide');
        assert(!i18n.missingKeys.size, 'clés absentes des catalogues: ' + [...i18n.missingKeys].join(', '));
        const attrs = [...node.querySelectorAll('[placeholder],[aria-label],[title]')]
          .map((n) => [n.getAttribute('placeholder'), n.getAttribute('aria-label'), n.getAttribute('title')].join(' '))
          .join(' ');
        const left = (node.textContent + attrs).match(/\{\w+\}/g);
        assert(!left, 'variables non remplacées: ' + (left || []).join(', '));
        main.replaceChildren(node);
        return 'ok';
      });
    }
  }
  i18n.setLocale('fr');

  check('le quiz va jusqu’au résultat', () => {
    main.replaceChildren(quizView(set.id));
    main.querySelector('.panel .btn-primary').click();
    let steps = 0;
    while (!main.querySelector('.summary') && steps++ < 200) {
      const option = main.querySelector('.option:not([disabled])');
      if (option) option.click();
      else {
        const input = main.querySelector('.answer-form input:not([readonly])');
        if (!input) break;
        input.value = 'x';
        main.querySelector('.answer-form button').click();
      }
      const next = main.querySelector('.study-nav .btn-primary');
      if (next) next.click();
    }
    assert(main.querySelector('.summary'), 'pas de résultat');
    return steps + ' questions';
  });

  check('écrire valide toute la série', () => {
    const small = store.createSet({ title: 'Petit', cards: [{ term: 'a', def: 'alpha' }, { term: 'b', def: 'beta' }] });
    main.replaceChildren(writeView(small.id));
    let steps = 0;
    while (!main.querySelector('.summary') && steps++ < 50) {
      const input = main.querySelector('.answer-form input:not([readonly])');
      if (input) {
        input.value = main.querySelector('.question-prompt').textContent.trim().startsWith('a') ? 'alpha' : 'beta';
        main.querySelector('.answer-form button').click();
      }
      const next = main.querySelector('.study-nav .btn-primary');
      if (next) next.click();
    }
    assert(main.querySelector('.summary'), 'pas de résumé');
    store.deleteSet(small.id);
    return steps + ' étapes';
  });

  check('associer retire les paires justes', () => {
    main.replaceChildren(matchView(set.id));
    const tiles = [...main.querySelectorAll('.match-tile')];
    assert(tiles.length === 12, 'tuiles: ' + tiles.length);
    const answerOf = new Map(store.getSet(set.id).cards.map((card) => [card.term, card.def]));
    let pairs = 0;
    for (const tile of tiles) {
      const answer = answerOf.get(tile.textContent);
      const partner = answer && tiles.find((other) => other.textContent === answer && !other.disabled);
      if (!partner || tile.disabled) continue;
      tile.click();
      partner.click();
      if (tile.dataset.state === 'hit') pairs++;
    }
    assert(pairs === 6, 'paires trouvées: ' + pairs);
    assert(main.querySelector('.summary'), 'pas de résumé');
    return '6 paires';
  });

  check('la révision note chaque carte due', () => {
    main.replaceChildren(reviewView(set.id));
    let steps = 0;
    while (!main.querySelector('.summary') && steps++ < 300) {
      const buttons = [...main.querySelectorAll('.study-nav button')];
      if (!buttons.length) break;
      buttons[buttons.length - 1].click();
    }
    assert(main.querySelector('.summary'), 'pas de résumé');
    return steps + ' étapes';
  });

  check('les flashcards se parcourent en entier', () => {
    main.replaceChildren(flashcardsView(set.id));
    let steps = 0;
    while (!main.querySelector('.summary') && steps++ < 80) {
      const buttons = [...main.querySelectorAll('.study-nav button')];
      if (!buttons.length) break;
      buttons[buttons.length - 1].click();
    }
    assert(main.querySelector('.summary'), 'pas de résumé');
    return steps + ' cartes';
  });

  check('les statistiques tracent leurs graphiques', () => {
    const node = statsView(set.id);
    assert(node.querySelector('.mastery-bar'), 'barre de maîtrise absente');
    assert(node.querySelector('.chart-columns'), 'colonnes d’activité absentes');
    assert(node.querySelector('.table'), 'tableau absent');
    return 'ok';
  });

  /* Past the goal the figure stops at the goal and the caption carries the
     real count. */
  check('l’objectif du jour s’arrête à l’objectif', () => {
    const goal = store.getSettings().goal;
    store.setSetting('goal', 5);
    try {
      const card = store.getSet(set.id).cards[1];
      for (let i = 0; i < 5; i++) store.recordAnswer(set.id, card.id, true);
      const tile = statTileIn(homeView(), i18n.t('stat.goal'));
      assert(tile.value === '5/5', 'affiche ' + tile.value);
      assert(tile.sub === i18n.t('stat.goalDone', { n: store.summary().today }), 'légende: ' + tile.sub);
      assert(tile.link === '#/settings/goal', 'lien: ' + tile.link);
      return tile.value + ', ' + tile.sub;
    } finally {
      store.setSetting('goal', goal);
    }
  });

  main.replaceChildren(settingsView('goal'));
  await Promise.resolve();
  const focused = document.activeElement;
  check('la tuile d’objectif ouvre son réglage', () => {
    assert(focused && focused.getAttribute('type') === 'number', 'champ actif: ' + (focused && focused.tagName));
    return 'champ de l’objectif sélectionné';
  });

  check('les pourcentages suivent la langue', () => {
    i18n.setLocale('en');
    try {
      const { value } = statTileIn(homeView(), i18n.t('stat.accuracy'));
      assert(/^\d+%$/.test(value), 'affiche ' + value);
      return value;
    } finally {
      i18n.setLocale('fr');
    }
  });

  check('une sauvegarde complète se restaure à l’identique', () => {
    const goal = store.getSettings().goal;
    store.setSetting('goal', 35);
    try {
      const backup = JSON.parse(store.exportAll());
      assert(backup.sessions.length && Object.keys(backup.activity).length, 'historique absent de la sauvegarde');
      store.resetAll();
      store.importPayload(backup);
      store.importPayload(backup);
      const restored = JSON.parse(store.exportAll());
      for (const part of ['sets', 'sessions', 'activity', 'settings']) {
        assert(JSON.stringify(restored[part]) === JSON.stringify(backup[part]), part + ' différents après restauration');
      }
      return 'jeux: ' + backup.sets.length + ', séances: ' + backup.sessions.length;
    } finally {
      store.setSetting('goal', goal);
    }
  });

  check('une sauvegarde abîmée ne casse rien', () => {
    const before = JSON.parse(store.exportAll());
    const now = Date.now();
    store.importPayload({
      sets: [],
      sessions: [
        { id: 'sans-date', setId: set.id, mode: 'quiz', at: 'hier', total: 3, correct: 2, ms: 10 },
        { id: 'jeu-inconnu', setId: 'inconnu', mode: 'quiz', at: now, total: 3, correct: 2, ms: 10 },
        { id: 'mode-inconnu', setId: set.id, mode: 'danse', at: now, total: 3, correct: 2, ms: 10 },
      ],
      activity: { 'pas-un-jour': 4, '2026-01-01': 'beaucoup' },
      settings: { goal: 'vingt', locale: null },
    });
    const after = JSON.parse(store.exportAll());
    assert(after.sessions.length === before.sessions.length, 'séance invalide acceptée');
    assert(JSON.stringify(after.activity) === JSON.stringify(before.activity), 'activité invalide acceptée');
    assert(JSON.stringify(after.settings) === JSON.stringify(before.settings), 'réglage invalide accepté');
    assert(statsView(set.id).querySelector('.table'), 'statistiques cassées');
    return 'ok';
  });

  /* A placeholder lost or misspelled in a translation would reach the screen
     as raw {name} text, so each string must carry the same ones as French. */
  const placeholders = (value) => (value.match(/\{\w+\}/g) || []).sort().join(' ');
  for (const { code } of i18n.LOCALES) {
    if (code === i18n.DEFAULT_LOCALE) continue;
    check(`catalogue ${code} aligné sur le français`, () => {
      const catalog = i18n.CATALOGS[code];
      assert(catalog, 'catalogue absent');
      const missing = keys.filter((key) => !Object.hasOwn(catalog, key));
      assert(!missing.length, 'clés manquantes: ' + missing.join(', '));
      const extra = Object.keys(catalog).filter((key) => !Object.hasOwn(reference, key));
      assert(!extra.length, 'clés en trop: ' + extra.join(', '));
      const drift = keys.filter((key) => placeholders(catalog[key]) !== placeholders(reference[key]));
      assert(!drift.length, 'variables différentes: ' + drift.join(', '));
      return keys.length + ' clés';
    });
  }

  /* index.html carries French text for the first paint and for visitors
     without JavaScript. It must match the catalogue, or the page changes under
     the reader as soon as the script runs. */
  const shell = new DOMParser().parseFromString(await (await fetch('../index.html')).text(), 'text/html');
  check('le HTML statique reprend le catalogue français', () => {
    const nodes = [...shell.querySelectorAll('[data-i18n]')];
    const stale = nodes.filter((node) => node.textContent.trim() !== reference[node.dataset.i18n]);
    assert(!stale.length, 'textes différents: ' + stale.map((node) => node.dataset.i18n).join(', '));
    const keyed = [...shell.querySelectorAll('[data-i18n-aria-label]')]
      .map((node) => node.getAttribute('data-i18n-aria-label'));
    const unknown = keyed.filter((key) => !Object.hasOwn(reference, key));
    assert(!unknown.length, 'clés inconnues: ' + unknown.join(', '));
    return nodes.length + ' textes, ' + keyed.length + ' attributs';
  });
}

const saved = KEYS.map((key) => localStorage.getItem(key));
function restore() {
  KEYS.forEach((key, i) => {
    if (saved[i] === null) localStorage.removeItem(key);
    else localStorage.setItem(key, saved[i]);
  });
}
/* Closing the page before the run ends still puts the data back. */
window.addEventListener('pagehide', restore);
try {
  await run();
} catch (error) {
  row('FAIL', 'exécution interrompue', String(error));
  failed++;
} finally {
  /* The views were built without the router, so their document key handlers
     are still live: take them down before the learner's data goes back, and
     reload the store so nothing left in memory can write test data over it. */
  teardown();
  restore();
  window.removeEventListener('pagehide', restore);
  store.load();
  main.replaceChildren();
}

summary.replaceChildren();
const title = document.createElement('h2');
title.textContent = failed ? `${failed} échec(s)` : 'Tout passe';
const line = document.createElement('p');
line.textContent = `${passed} réussites, ${failed} échecs.`;
summary.append(title, line);
document.title = (failed ? 'FAIL ' : 'OK ') + passed + '/' + (passed + failed);
