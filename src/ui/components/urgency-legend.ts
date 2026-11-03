// Légende du code couleur d'urgence : un « i » ouvre la liste des couleurs et de leur sens.
import { URGENCY_HINTS, URGENCY_LABELS, URGENCY_ORDER } from '../../domain/urgency';
import { h } from '../dom';
import { icon } from '../icons';
import { openDialog } from './dialog';

export function openUrgencyLegend(): void {
  openDialog<boolean>('Légende des couleurs', (close) => [
    h('p', { class: 'muted' }, 'Chaque bouteille est colorée selon l’échéance de sa fenêtre de garde.'),
    h(
      'ul',
      { class: 'legend' },
      URGENCY_ORDER.map((u) =>
        h('li', { class: 'legend__item' }, h('span', { class: `legend__swatch u-fill u-fill--${u}`, 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, URGENCY_LABELS[u]), h('div', { class: 'muted' }, URGENCY_HINTS[u]))),
      ),
    ),
    h('p', { class: 'muted' }, 'Dans le résumé « À boire » de la Cave, « À attendre » regroupe Bientôt et Trop tôt.'),
    h('p', { class: 'muted' }, 'La pastille rouge sur l’onglet Cave compte les bouteilles en retard ou à finir : celles à boire en priorité.'),
    h('div', { class: 'dialog__actions' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close(true) }, 'Fermer')),
  ]);
}

/** Bouton « i » de la légende, à placer dans un en-tête. */
export function legendButton(): HTMLElement {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Légende des couleurs', onClick: () => openUrgencyLegend() }, icon('info'));
}
