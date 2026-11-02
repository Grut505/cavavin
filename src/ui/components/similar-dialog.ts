// Valeur proche d'une valeur déjà utilisée : évite de créer des variantes quasi identiques.
import { h } from '../dom';
import { openDialog } from './dialog';

export type SimilarChoice = 'use' | 'keep';

/** `null` si l'utilisateur annule l'enregistrement. */
export function askSimilar(opts: { label: string; typed: string; suggestion: string }): Promise<SimilarChoice | null> {
  const { result } = openDialog<SimilarChoice>('Valeur proche déjà utilisée', (close) => [
    h(
      'p',
      {},
      `${opts.label} : « ${opts.typed} » ressemble à « ${opts.suggestion} », déjà présent dans votre cave. S’agit-il de la même chose ?`,
    ),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close('use') }, `Utiliser « ${opts.suggestion} »`),
      h('button', { class: 'btn', type: 'button', onClick: () => close('keep') }, `Garder « ${opts.typed} »`),
      h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler'),
    ),
  ]);
  return result;
}
