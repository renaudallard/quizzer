/* The labelled pictures of a set in the editor. A picture is added, a zone
   is drawn over each of its labels with a drag, and the text the zone hides
   is typed in the list under it. The pictures are those of the draft, kept
   in memory like the cards until the set is saved. */

import { el, icon, toast, mount } from '../dom.js';
import { t } from '../i18n/index.js';
import { addImage, IMAGE_ERRORS } from '../images.js';
import { uid, clamp } from '../util.js';
import { diagramStage, place } from '../diagram.js';

/* A drag shorter than this, in pixels on screen, is a click, not a zone. */
const MIN_ZONE = 8;

/* Draws a zone on stage with the pointer, then hands it to done as
   fractions of the picture. */
function drawZones(stage, done) {
  stage.addEventListener('dragstart', (event) => event.preventDefault());
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.diagram-zone')) return;
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const at = (point) => ({
      x: clamp((point.clientX - box.left) / box.width, 0, 1),
      y: clamp((point.clientY - box.top) / box.height, 0, 1),
    });
    const start = at(event);
    const ghost = el('div', { class: 'diagram-zone diagram-ghost', 'aria-hidden': 'true' });
    let zone = null;
    stage.appendChild(ghost);
    stage.setPointerCapture(event.pointerId);

    const move = (next) => {
      const end = at(next);
      zone = {
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y),
      };
      place(ghost, zone);
    };
    const stop = (keep) => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', cancel);
      ghost.remove();
      if (keep && zone && zone.w * box.width >= MIN_ZONE && zone.h * box.height >= MIN_ZONE) done(zone);
    };
    const up = () => stop(true);
    const cancel = () => stop(false);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', cancel);
  });
}

/* diagrams is the draft's list, changed in place. check() says what stops
   the save, with the focus there, or returns true. */
export function diagramsEditor(diagrams, markDirty) {
  const list = el('div', { class: 'stack' });

  function panel(diagram, index) {
    const number = index + 1;
    const stage = diagramStage(diagram, t('diagram.title', { n: number }));
    const zoneList = el('ol', { class: 'zone-list' });
    let boxes = [];

    function show(focusLast) {
      for (const box of boxes) box.remove();
      const rows = diagram.zones.map((zone, i) => {
        const box = place(el('div', { class: 'diagram-zone', 'aria-hidden': 'true' }, String(i + 1)), zone);
        const input = el('input', {
          type: 'text', class: 'input', value: zone.text,
          placeholder: t('diagram.zonePlaceholder'), 'aria-label': t('diagram.zoneText', { n: i + 1 }),
          oninput: () => { zone.text = input.value; markDirty(); },
          onfocus: () => { box.dataset.active = '1'; },
          onblur: () => { delete box.dataset.active; },
        });
        box.addEventListener('click', () => input.focus());
        return { box, row: el('li', {},
          el('span', { class: 'idx' }, String(i + 1)),
          input,
          el('button', {
            type: 'button', class: 'icon-btn', 'aria-label': t('diagram.removeZone', { n: i + 1 }),
            onclick: () => {
              diagram.zones.splice(i, 1);
              markDirty();
              show(false);
            },
          }, icon('trash'))) };
      });
      boxes = rows.map((entry) => entry.box);
      stage.append(...boxes);
      mount(zoneList, rows.map((entry) => entry.row));
      if (focusLast && rows.length) rows[rows.length - 1].row.querySelector('input').focus();
    }

    drawZones(stage, (zone) => {
      diagram.zones.push({ id: uid(), ...zone, text: '' });
      markDirty();
      show(true);
    });
    show(false);

    const caption = el('input', {
      type: 'text', class: 'input', value: diagram.caption,
      placeholder: t('diagram.captionPlaceholder'), 'aria-label': t('diagram.caption'),
      oninput: () => { diagram.caption = caption.value; markDirty(); },
    });
    return el('section', { class: 'panel stack diagram-edit' },
      el('div', { class: 'row-between' },
        el('h3', {}, t('diagram.title', { n: number })),
        el('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: () => {
            diagrams.splice(index, 1);
            markDirty();
            paint();
          },
        }, icon('trash'), t('diagram.remove'))),
      caption,
      el('p', { class: 'field-hint' }, t('diagram.drawHint')),
      el('div', { class: 'diagram-wrap' }, stage),
      zoneList);
  }

  function paint() {
    mount(list, diagrams.map(panel));
  }
  paint();

  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    file.value = '';
    if (!chosen) return;
    let image;
    try {
      image = await addImage(chosen);
    } catch (error) {
      toast(t(IMAGE_ERRORS[error.message] || 'editor.imageFailed'));
      return;
    }
    diagrams.push({ id: uid(), image, caption: '', zones: [] });
    markDirty();
    paint();
  });

  function check() {
    for (const [index, diagram] of diagrams.entries()) {
      const node = list.children[index];
      const empty = diagram.zones.findIndex((zone) => !zone.text.trim());
      if (!diagram.zones.length) {
        toast(t('diagram.noZone', { n: index + 1 }));
        node.querySelector('input').focus();
        return false;
      }
      if (empty >= 0) {
        toast(t('diagram.emptyZone', { n: empty + 1, picture: index + 1 }));
        node.querySelectorAll('.zone-list input')[empty].focus();
        return false;
      }
    }
    return true;
  }

  const root = el('section', { class: 'stack', style: { marginBottom: '20px' } },
    el('h2', {}, t('diagram.section')),
    el('p', { class: 'field-hint' }, t('diagram.sectionHint', { labels: t('mode.labels') })),
    list,
    el('div', { class: 'row' },
      file,
      el('button', { type: 'button', class: 'btn', onclick: () => file.click() }, icon('image'), t('diagram.add'))));
  return { root, check };
}
