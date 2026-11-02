// Dialogue de suppression d'un emplacement ou d'un meuble (FR-003d).
import type { DeletionDecision } from '../../domain/locations';
import { h } from '../dom';
import { confirmDialog, openDialog } from './dialog';

export interface MoveTarget {
  id: string;
  label: string;
}

export interface DeleteRequest {
  /** Libellé de ce qui est supprimé : « l'étagère Étagère 2 », « le meuble Cave A »… */
  what: string;
  bottles: number;
  /** Emplacements candidats pour recevoir les bouteilles (hors éléments supprimés). */
  targets: MoveTarget[];
}

/**
 * Retourne :
 *  - `null` si l'utilisateur annule ;
 *  - `{ proceed: true }` pour un élément vide confirmé ;
 *  - `{ proceed: true, decision }` pour un élément non vide.
 */
export async function askDelete(
  req: DeleteRequest,
): Promise<{ proceed: true; decision?: DeletionDecision } | null> {
  if (req.bottles === 0) {
    const ok = await confirmDialog({
      title: 'Supprimer ?',
      message: `Supprimer ${req.what} ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    return ok ? { proceed: true } : null;
  }

  const plural = req.bottles > 1 ? 'bouteilles' : 'bouteille';
  const { result } = openDialog<DeletionDecision>(`Supprimer ${req.what}`, (close) => {
    const select = h(
      'select',
      { class: 'field__input', 'aria-label': 'Destination des bouteilles' },
      req.targets.map((t) => h('option', { value: t.id }, t.label)),
    );
    const hasTargets = req.targets.length > 0;
    return [
      h('p', { class: 'alert' }, `Il y a ${req.bottles} ${plural}. Rien n’est supprimé tant que vous n’avez pas choisi où les ranger.`),
      hasTargets
        ? h(
            'div',
            { class: 'stack' },
            h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Déplacer vers'), select),
            h(
              'button',
              { class: 'btn btn--primary', type: 'button', onClick: () => close({ action: 'move', toLocationId: select.value }) },
              'Déplacer puis supprimer',
            ),
          )
        : null,
      h(
        'button',
        { class: 'btn', type: 'button', onClick: () => close({ action: 'unassigned' }) },
        'Ranger dans « Sans emplacement »',
      ),
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler')),
    ];
  });
  const decision = await result;
  return decision ? { proceed: true, decision } : null;
}
