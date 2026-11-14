/* Labels: each zone of a labelled picture is covered by a field, where the
   label it hides is typed. Checking grades every field at once, the way a
   typed answer is graded, then lists what was expected. Labelled pictures
   have no review schedule, so a round only goes into the history. */

import { el, icon, mount } from '../dom.js';
import { t } from '../i18n/index.js';
import * as store from '../store.js';
import { grade } from '../text.js';
import { diagramStage, place } from '../diagram.js';
import { studyShell, summaryPanel, saveSession, cardText, interpolateNode } from '../study.js';
import { notFoundPanel, messagePanel } from '../views/shared.js';

const MARKS = { correct: 'check', almost: 'alert', wrong: 'close' };

export function labelsView(id) {
  const set = store.getSet(id);
  if (!set) return notFoundPanel(t('set.notFound'));
  if (!set.diagrams.length) {
    return messagePanel(t('labels.noneTitle'), t('labels.none'), { href: '#/set/' + set.id, label: t('common.back') });
  }

  const shell = studyShell({ set, modeKey: 'mode.labels' });
  const stage = el('div');
  shell.body.appendChild(stage);
  let run = null;

  function begin() {
    run = { index: 0, found: 0, total: 0, startedAt: Date.now() };
    paint();
  }

  function paint() {
    const diagrams = set.diagrams;
    if (run.index >= diagrams.length) {
      finish();
      return;
    }
    shell.setProgress(run.index, diagrams.length);
    const diagram = diagrams[run.index];
    const picture = diagramStage(diagram, diagram.caption || t('image.alt'));
    const score = el('p', { class: 'labels-score', role: 'status', 'aria-live': 'polite' });
    const results = el('ol', { class: 'labels-results' });
    const nav = el('div', { class: 'study-nav' });
    let checked = false;

    /* Enter goes on to the next zone, and from the last one checks. */
    const fields = diagram.zones.map((zone, i) => {
      const field = el('input', {
        type: 'text', class: 'diagram-answer', autocomplete: 'off', autocapitalize: 'off',
        autocorrect: 'off', spellcheck: 'false', 'aria-label': t('labels.zone', { n: i + 1 }),
        onkeydown: (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (i + 1 < fields.length) fields[i + 1].focus();
          else check();
        },
      });
      picture.appendChild(place(field, zone));
      return field;
    });

    /* An almost right label counts as found, as everywhere else, and still
       shows its exact spelling. */
    function check() {
      if (checked) return;
      checked = true;
      const settings = store.getSettings();
      let found = 0;
      const rows = diagram.zones.map((zone, i) => {
        const field = fields[i];
        const result = field.value.trim() ? grade(field.value, zone.text, settings) : { verdict: 'wrong', accent: false };
        field.readOnly = true;
        field.dataset.state = result.verdict;
        if (result.verdict !== 'wrong') found += 1;
        const exact = result.verdict === 'correct' && !result.accent;
        return el('li', { class: 'labels-result', dataset: { state: result.verdict } },
          icon(MARKS[result.verdict]),
          el('span', {}, t('labels.zone', { n: i + 1 }), ': ', field.value.trim() || t('test.noAnswer')),
          exact ? null : el('span', { class: 'hint' }, interpolateNode('quiz.expected', 'answer', cardText(zone.text))));
      });
      run.found += found;
      run.total += diagram.zones.length;
      score.textContent = t('labels.found', { n: found, total: diagram.zones.length });
      mount(results, rows);
      const last = run.index === diagrams.length - 1;
      const next = el('button', {
        type: 'button', class: 'btn btn-primary btn-lg',
        onclick: () => {
          run.index += 1;
          paint();
        },
      }, last ? t('labels.finish') : t('labels.next'), icon('right'));
      mount(nav, next);
      next.focus();
    }

    mount(nav, el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: check }, icon('check'), t('quiz.check')));
    mount(stage,
      el('div', { class: 'question' },
        el('p', { class: 'question-kind' }, t('labels.prompt')),
        diagram.caption ? el('h2', { class: 'labels-caption' }, diagram.caption) : null,
        el('div', { class: 'diagram-wrap' }, picture)),
      score,
      results,
      nav);
    queueMicrotask(() => { if (fields.length && fields[0].isConnected) fields[0].focus(); });
  }

  function finish() {
    const { found, total, startedAt } = run;
    shell.setProgress(set.diagrams.length, set.diagrams.length);
    saveSession(set.id, { mode: 'labels', total, correct: found, ms: Date.now() - startedAt });
    run = null;
    mount(stage, summaryPanel({
      score: found + '/' + total,
      scoreLabel: t('labels.doneBody'),
      title: t('labels.doneTitle'),
      actions: [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: begin }, icon('restart'), t('common.restart')),
        el('a', { class: 'btn', href: '#/set/' + set.id }, t('common.back')),
        el('a', { class: 'btn', href: '#/set/' + set.id + '/stats' }, icon('chart'), t('mode.stats')),
      ],
    }));
  }

  begin();
  return shell.root;
}
