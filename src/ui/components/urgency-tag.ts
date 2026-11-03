// Pastille « statut à boire » : point coloré (code couleur de la cave) + libellé.
import { URGENCY_HINTS, URGENCY_LABELS, type Urgency } from '../../domain/urgency';
import { h } from '../dom';

export function urgencyTag(u: Urgency): HTMLElement {
  return h('span', { class: 'urgency-tag', title: URGENCY_HINTS[u], 'data-urgency': u }, h('span', { class: `urgency-tag__dot u-fill u-fill--${u}`, 'aria-hidden': 'true' }), URGENCY_LABELS[u]);
}
