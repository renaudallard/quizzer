/* A labelled picture as the editor and the Labels mode both show it: the
   picture at its own proportions, with boxes laid over it where its zones
   are. */

import { el } from './dom.js';
import { cardImage } from './images.js';

export function diagramStage(diagram, alt) {
  return el('div', { class: 'diagram-stage' }, cardImage(diagram.image, alt, 'diagram-image'));
}

/* Lays node over the picture where zone is. A zone is held in fractions of
   the picture, so the box follows it at any size. */
export function place(node, zone) {
  Object.assign(node.style, {
    left: zone.x * 100 + '%',
    top: zone.y * 100 + '%',
    width: zone.w * 100 + '%',
    height: zone.h * 100 + '%',
  });
  return node;
}
