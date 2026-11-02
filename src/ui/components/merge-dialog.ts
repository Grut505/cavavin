// « Fusionner avec une autre fiche » : la fiche affichée absorbe l'autre (bouteilles, historique, champs vides).
import type { AppContext } from '../../app';
import { mergeCandidates } from '../../domain/merge';
import type { Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { confirmDialog, openDialog } from './dialog';

/** `true` si une fusion a eu lieu. */
export async function openMergeDialog(ctx: Pick<AppContext, 'repo'>, opts: { wine: Wine }): Promise<boolean> {
  const [wines, stocks] = await Promise.all([ctx.repo.list('wine'), ctx.repo.list('stock')]);
  const bottles = new Map<string, number>();
  for (const s of stocks) if (!s.deleted) bottles.set(s.wine_id, (bottles.get(s.wine_id) ?? 0) + s.quantity);
  const keepTitle = wineTitle(opts.wine);

  const { result } = openDialog<boolean>('Fusionner avec une autre fiche', (close) => {
    const search = h('input', { class: 'field__input', type: 'search', placeholder: 'Rechercher une fiche…', 'aria-label': 'Rechercher une fiche', autocomplete: 'off' });
    const list = h('ul', { class: 'list merge__list' });
    const error = h('div', { role: 'alert', 'aria-live': 'assertive' });

    const pick = async (other: Wine): Promise<void> => {
      const t = wineTitle(other);
      const n = bottles.get(other.id) ?? 0;
      const ok = await confirmDialog({
        title: 'Fusionner ces deux fiches ?',
        message: `« ${t.primary} · ${t.secondary} »${n > 0 ? ` (${n} bouteille${n > 1 ? 's' : ''})` : ''} sera fusionnée dans « ${keepTitle.primary} · ${keepTitle.secondary} » : bouteilles, historique des sorties et informations manquantes y sont repris, puis cette fiche disparaît. Cette action ne s’annule pas.`,
        confirmLabel: 'Fusionner',
        danger: true,
      });
      if (!ok) return;
      try {
        await ctx.repo.mergeWines(opts.wine.id, other.id);
        close(true);
      } catch (e) {
        error.replaceChildren(h('p', { class: 'alert alert--error' }, e instanceof Error ? e.message : String(e)));
      }
    };

    const paint = (): void => {
      const found = mergeCandidates(wines, opts.wine, search.value);
      list.replaceChildren(
        ...(found.length === 0
          ? [h('li', { class: 'muted' }, 'Aucune autre fiche.')]
          : found.slice(0, 30).map((w) => {
              const t = wineTitle(w);
              const n = bottles.get(w.id) ?? 0;
              return h(
                'li',
                { class: 'list__item' },
                h(
                  'button',
                  { class: 'btn grow', type: 'button', style: 'justify-content:flex-start;text-align:left', 'data-wine-id': w.id, onClick: () => void pick(w) },
                  h('span', {}, h('strong', {}, t.primary), h('span', { class: 'muted' }, ` ${t.secondary}${n > 0 ? ` · ×${n}` : ' · épuisée'}`)),
                ),
              );
            })),
      );
    };
    search.addEventListener('input', paint);
    paint();

    return [
      h('p', { class: 'muted' }, `Choisissez la fiche en double : elle sera fusionnée dans « ${keepTitle.primary} · ${keepTitle.secondary} », qui est conservée. Les doublons probables sont en tête.`),
      search,
      list,
      error,
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler')),
    ];
  });
  return (await result) === true;
}
