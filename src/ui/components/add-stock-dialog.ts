// « Ajouter des bouteilles » à une fiche existante : emplacement (schéma de la cave) et quantité.
import type { AppContext } from '../../app';
import type { Furniture, Location, PositionHint, Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { icon } from '../icons';
import { openDialog } from './dialog';
import { locationLabel, pickLocation } from './location-picker';

/** `true` si des bouteilles ont été ajoutées. */
export function openAddStockDialog(ctx: Pick<AppContext, 'repo'>, opts: { wine: Wine; furniture: Furniture[] }): Promise<boolean> {
  const { result } = openDialog<boolean>('Ajouter des bouteilles', (close) => {
    const title = wineTitle(opts.wine);
    let dest: { location: Location; hint: PositionHint | null } | null = null;
    const qty = h('input', { class: 'field__input', id: 'add-quantity', type: 'number', inputmode: 'numeric', min: '1', value: '1', 'aria-label': 'Quantité' });
    const destBtn = h('button', { class: 'btn', type: 'button', style: 'justify-content:flex-start', id: 'add-dest' }, icon('cave'), 'Choisir un emplacement');
    const err = h('div', { role: 'alert', 'aria-live': 'assertive' });
    const clear = (): void => err.replaceChildren();
    qty.addEventListener('input', clear);

    destBtn.addEventListener('click', async () => {
      const picked = await pickLocation(ctx, { locationId: dest?.location.id, hint: dest?.hint ?? null });
      if (!picked) return;
      dest = picked;
      clear();
      destBtn.replaceChildren(icon('cave'), `${locationLabel(picked.location, opts.furniture)}${picked.hint ? ` · ${picked.hint}` : ''}`);
    });

    const confirm = h('button', { class: 'btn btn--primary', type: 'button' }, 'Ajouter');
    confirm.addEventListener('click', async () => {
      const n = Number(qty.value);
      if (!dest) return void err.replaceChildren(h('p', { class: 'alert alert--error' }, 'Choisissez un emplacement.'));
      if (!Number.isInteger(n) || n < 1) return void err.replaceChildren(h('p', { class: 'alert alert--error' }, 'La quantité doit être un entier supérieur ou égal à 1.'));
      confirm.setAttribute('disabled', '');
      try {
        await ctx.repo.addStock(opts.wine.id, { location_id: dest.location.id, quantity: n, position_hint: dest.hint });
        close(true);
      } catch (e) {
        err.replaceChildren(h('p', { class: 'alert alert--error' }, e instanceof Error ? e.message : String(e)));
        confirm.removeAttribute('disabled');
      }
    });

    return [
      h('p', { class: 'muted' }, `${title.primary} · ${title.secondary}`),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Emplacement'), destBtn),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Quantité'), qty),
      err,
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler'), confirm),
    ];
  });
  return result.then((v) => v === true);
}
