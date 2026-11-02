// « Sortir une bouteille » : emplacement, quantité, motif, date, note (FR-012).
import type { AppContext } from '../../app';
import { OUTFLOW_REASON_LABELS, todayIso, validateOutflow } from '../../domain/stock';
import { OUTFLOW_REASONS, type Stock, type Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { openDialog } from './dialog';
import { openTastingDialog } from './tasting-dialog';
import { showToast } from './toast';

export interface StockChoice {
  stock: Stock;
  label: string;
}

/** `true` si une sortie a été enregistrée. */
export function openOutflowDialog(
  ctx: Pick<AppContext, 'repo'>,
  opts: { wine: Wine; choices: StockChoice[]; stockId?: string },
): Promise<boolean> {
  const choices = opts.choices.filter((c) => c.stock.quantity > 0);
  if (choices.length === 0) return Promise.resolve(false);
  /** Sortie enregistrée par ce dialogue (pour l'avis et l'annulation). */
  let done: { ids: string[]; reason: string; note: string | null } | null = null;

  const { result } = openDialog<boolean>('Sortir une bouteille', (close) => {
    const title = wineTitle(opts.wine);
    const initial = choices.find((c) => c.stock.id === opts.stockId) ?? choices[0]!;

    const where = h(
      'select',
      { class: 'field__input', id: 'out-stock', 'aria-label': 'Emplacement' },
      choices.map((c) =>
        h('option', { value: c.stock.id, ...(c.stock.id === initial.stock.id ? { selected: true } : {}) }, `${c.label} (×${c.stock.quantity})`),
      ),
    );
    const qty = h('input', { class: 'field__input', id: 'out-quantity', type: 'number', inputmode: 'numeric', min: '1', value: '1', 'aria-label': 'Quantité' });
    const reason = h(
      'select',
      { class: 'field__input', id: 'out-reason', 'aria-label': 'Motif' },
      OUTFLOW_REASONS.map((r) => h('option', { value: r, ...(r === 'drunk' ? { selected: true } : {}) }, OUTFLOW_REASON_LABELS[r])),
    );
    const date = h('input', { class: 'field__input', id: 'out-date', type: 'date', value: todayIso(), max: todayIso(), 'aria-label': 'Date' });
    const note = h('textarea', { class: 'field__input', id: 'out-note', rows: '2', placeholder: 'Facultatif : avec qui, impressions…', 'aria-label': 'Note' });
    const errors: Record<string, HTMLElement> = {
      quantity: h('span', { class: 'field__error', role: 'alert' }),
      date: h('span', { class: 'field__error', role: 'alert' }),
      reason: h('span', { class: 'field__error', role: 'alert' }),
    };
    const general = h('div', { role: 'alert', 'aria-live': 'assertive' });
    for (const [el, key] of [[qty, 'quantity'], [date, 'date'], [reason, 'reason']] as const) {
      const clear = (): void => void (errors[key]!.textContent = '');
      el.addEventListener('input', clear);
      el.addEventListener('change', clear);
    }

    const available = (): number => choices.find((c) => c.stock.id === where.value)?.stock.quantity ?? 0;
    where.addEventListener('change', () => {
      qty.setAttribute('max', String(available()));
      if (Number(qty.value) > available()) qty.value = String(available());
    });
    qty.setAttribute('max', String(available()));

    const confirm = h('button', { class: 'btn btn--primary', type: 'button' }, 'Sortir');
    confirm.addEventListener('click', async () => {
      general.replaceChildren();
      const check = validateOutflow({ quantity: Number(qty.value), available: available(), date: date.value, reason: reason.value });
      Object.values(errors).forEach((e) => (e.textContent = ''));
      if (!check.ok) {
        for (const i of check.issues) if (errors[i.field]) errors[i.field]!.textContent = i.message;
        return;
      }
      confirm.setAttribute('disabled', '');
      try {
        const ids = await ctx.repo.recordOutflow(where.value, {
          reason: check.value.reason,
          date: check.value.date,
          note: note.value,
          quantity: check.value.quantity,
        });
        done = { ids, reason: check.value.reason, note: note.value.trim() || null };
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
      choices.length > 1 ? field('Emplacement', where) : h('p', {}, h('strong', {}, initial.label), ` (×${initial.stock.quantity})`),
      ...(choices.length > 1 ? [] : [where]).map((w) => (w.setAttribute('hidden', ''), w)),
      field('Quantité', qty, errors.quantity),
      field('Motif', reason, errors.reason),
      field('Date', date, errors.date),
      field('Note', note),
      general,
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler'), confirm),
    ];
  });
  return result.then(async (v) => {
    if (v !== true || !done) return v === true;
    const { ids, reason, note } = done;
    // Une bouteille bue : on demande l'avis (note, commentaire) ; il alimente « À racheter ».
    if (reason === 'drunk') await openTastingDialog(ctx, { wine: opts.wine, outflowIds: ids, note });
    showToast({
      message: ids.length > 1 ? `${ids.length} bouteilles sorties.` : 'Bouteille sortie.',
      actionLabel: 'Annuler',
      onAction: async () => {
        await ctx.repo.undoOutflows(ids);
        window.dispatchEvent(new HashChangeEvent('hashchange')); // l'écran se recalcule
      },
    });
    return true;
  });
}
