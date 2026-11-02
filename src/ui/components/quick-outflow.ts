// « Je la bois » : ouvre la sortie de stock d'une fiche directement depuis une liste (motif « bue », date du jour par défaut).
import type { AppContext } from '../../app';
import type { Wine } from '../../domain/types';
import { locationLabel } from './location-picker';
import { openOutflowDialog, type StockChoice } from './outflow-dialog';

/** `true` si une sortie a été enregistrée. */
export async function quickOutflow(ctx: Pick<AppContext, 'repo'>, wine: Wine): Promise<boolean> {
  const [stocks, locations, furniture] = await Promise.all([ctx.repo.list('stock'), ctx.repo.list('location'), ctx.repo.list('furniture')]);
  const choices: StockChoice[] = stocks
    .filter((s) => s.wine_id === wine.id && s.quantity > 0)
    .map((stock) => {
      const loc = locations.find((l) => l.id === stock.location_id && !l.deleted);
      return { stock, label: loc ? locationLabel(loc, furniture) : 'Emplacement supprimé' };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return openOutflowDialog(ctx, { wine, choices });
}
