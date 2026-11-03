// « Déplacer » des bouteilles vers un autre emplacement, choisi dans le schéma de la cave (FR-011).
import type { AppContext } from '../../app';
import { validateMove } from '../../domain/stock';
import { positionLabel, type Furniture, type Location, type PositionHint, type Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { icon } from '../icons';
import { openDialog } from './dialog';
import { locationLabel, pickLocation } from './location-picker';
import type { StockChoice } from './outflow-dialog';

/** `true` si des bouteilles ont été déplacées. */
export function openMoveDialog(
  ctx: Pick<AppContext, 'repo'>,
  opts: { wine: Wine; choices: StockChoice[]; furniture: Furniture[]; stockId?: string },
): Promise<boolean> {
  const choices = opts.choices.filter((c) => c.stock.quantity > 0);
  if (choices.length === 0) return Promise.resolve(false);

  const { result } = openDialog<boolean>('Déplacer des bouteilles', (close) => {
    const title = wineTitle(opts.wine);
    const initial = choices.find((c) => c.stock.id === opts.stockId) ?? choices[0]!;
    let dest: { location: Location; hint: PositionHint | null } | null = null;

    const from = h(
      'select',
      { class: 'field__input', id: 'mv-stock', 'aria-label': 'Depuis' },
      choices.map((c) =>
        h('option', { value: c.stock.id, ...(c.stock.id === initial.stock.id ? { selected: true } : {}) }, `${c.label} (×${c.stock.quantity})`),
      ),
    );
    const qty = h('input', { class: 'field__input', id: 'mv-quantity', type: 'number', inputmode: 'numeric', min: '1', value: String(initial.stock.quantity), 'aria-label': 'Quantité' });
    const destBtn = h('button', { class: 'btn', type: 'button', style: 'justify-content:flex-start', id: 'mv-dest' }, icon('cave'), 'Choisir la destination');
    const errors = {
      quantity: h('span', { class: 'field__error', role: 'alert' }),
      destination: h('span', { class: 'field__error', role: 'alert' }),
    };
    const general = h('div', { role: 'alert', 'aria-live': 'assertive' });
    const current = (): StockChoice => choices.find((c) => c.stock.id === from.value)!;

    from.addEventListener('change', () => {
      qty.value = String(current().stock.quantity);
      qty.setAttribute('max', String(current().stock.quantity));
      errors.quantity.textContent = '';
    });
    qty.setAttribute('max', String(initial.stock.quantity));
    qty.addEventListener('input', () => (errors.quantity.textContent = ''));

    destBtn.addEventListener('click', async () => {
      const picked = await pickLocation(ctx, { locationId: dest?.location.id, hint: dest?.hint ?? null });
      if (!picked) return;
      dest = picked;
      errors.destination.textContent = '';
      destBtn.replaceChildren(
        icon('cave'),
        `${locationLabel(picked.location, opts.furniture)}${picked.hint ? ` · ${positionLabel(picked.hint)}` : ''}`,
      );
    });

    const confirm = h('button', { class: 'btn btn--primary', type: 'button' }, 'Déplacer');
    confirm.addEventListener('click', async () => {
      general.replaceChildren();
      errors.quantity.textContent = '';
      errors.destination.textContent = '';
      const check = validateMove({
        quantity: Number(qty.value),
        available: current().stock.quantity,
        fromLocationId: current().stock.location_id,
        toLocationId: dest?.location.id ?? null,
      });
      if (!check.ok) {
        for (const i of check.issues) if (i.field === 'quantity' || i.field === 'destination') errors[i.field].textContent = i.message;
        return;
      }
      confirm.setAttribute('disabled', '');
      try {
        await ctx.repo.moveBottles(from.value, dest!.location.id, check.quantity, dest!.hint);
        close(true);
      } catch (e) {
        general.replaceChildren(h('p', { class: 'alert alert--error' }, e instanceof Error ? e.message : String(e)));
        confirm.removeAttribute('disabled');
      }
    });

    const field = (label: string, control: HTMLElement, err?: HTMLElement): HTMLElement =>
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control, err ?? null);

    return [
      h('p', { class: 'muted' }, `${title.primary} · ${title.secondary}`),
      choices.length > 1 ? field('Depuis', from) : h('p', {}, h('strong', {}, initial.label), ` (×${initial.stock.quantity})`),
      ...(choices.length > 1 ? [] : [from]).map((w) => (w.setAttribute('hidden', ''), w)),
      field('Quantité', qty, errors.quantity),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Vers'), destBtn, errors.destination),
      general,
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler'), confirm),
    ];
  });
  return result.then((v) => v === true);
}
