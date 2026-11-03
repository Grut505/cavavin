// « Quoi boire ? » : une petite fenêtre où l'on tape un plat ; la Liste s'ouvre filtrée sur les bouteilles qui vont avec.
import { pairingVocabulary } from '../../domain/pairing';
import type { WineRow } from '../../domain/query';
import { h } from '../dom';
import { Router } from '../router';
import { openDialog } from './dialog';

export function openDishDialog(rows: WineRow[]): void {
  const vocab = pairingVocabulary(rows, 8);
  openDialog<boolean>('Quoi boire ?', (close) => {
    const input = h('input', {
      class: 'field__input',
      id: 'dish-input',
      type: 'search',
      placeholder: 'Ex. risotto aux champignons, curry de légumes…',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      'aria-label': 'Plat ou ingrédient',
    });
    const go = (text: string): void => {
      const q = text.trim();
      if (q === '') {
        input.focus();
        return;
      }
      close(true);
      Router.go(`/liste?plat=${encodeURIComponent(q)}`);
    };
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        go(input.value);
      }
    });
    queueMicrotask(() => input.focus());
    return [
      h('p', { class: 'muted' }, 'Un plat ou un ingrédient (cuisine végétarienne) : la Liste montre les bouteilles dont les mets conseillés correspondent, même avec des fautes de frappe.'),
      h('label', { class: 'field', for: 'dish-input' }, h('span', { class: 'field__label' }, 'Plat ou ingrédient'), input),
      vocab.length > 0
        ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Mets de ma cave' }, vocab.map((v) => h('button', { class: 'btn btn--small', type: 'button', onClick: () => go(v.label) }, v.label)))
        : h('p', { class: 'muted' }, 'Aucun met n’est encore renseigné : ils sont ajoutés par Claude à la lecture d’étiquette, ou via Réglages → Compléter les mets.'),
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler'), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => go(input.value) }, 'Chercher')),
    ];
  });
}
