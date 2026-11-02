// Bouton « Copier le prompt » : place le prompt de lecture d'étiquette dans le presse-papiers.
import { LABEL_PROMPT } from '../../scan/prompt';
import { h } from '../dom';

export function promptCopy(): HTMLElement {
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite', style: 'font-size:0.875rem' });
  const area = h('textarea', {
    class: 'field__input',
    readonly: true,
    rows: '10',
    'aria-label': 'Prompt pour Claude',
    style: 'font-size:0.8rem;font-family:ui-monospace,monospace',
  });
  area.value = LABEL_PROMPT;
  const details = h('details', {}, h('summary', { style: 'min-height:44px;display:flex;align-items:center;cursor:pointer' }, 'Voir le prompt'), area);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(LABEL_PROMPT);
      status.textContent = 'Prompt copié. Collez-le dans Claude, joignez la photo de l’étiquette, puis revenez coller la réponse.';
    } catch {
      details.setAttribute('open', '');
      area.focus();
      area.select();
      status.textContent = 'Copie automatique impossible : le texte est sélectionné, copiez-le à la main.';
    }
  };

  return h(
    'div',
    { class: 'stack' },
    h('button', { class: 'btn btn--small', type: 'button', onClick: () => void copy() }, 'Copier le prompt pour Claude'),
    status,
    details,
  );
}
