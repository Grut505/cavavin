// Liste de courses : les vins à racheter, avec fournisseur et prix ; « Acheté » ajoute les bouteilles à la cave.
import type { AppContext } from '../../app';
import { buildRows } from '../../domain/query';
import { shoppingList, shoppingText } from '../../domain/shopping';
import { formatEuro } from '../../domain/stats';
import { wineTitle } from '../../domain/wine';
import { openAddStockDialog } from '../components/add-stock-dialog';
import { pageHeader } from '../components/page-header';
import { showToast } from '../components/toast';
import { h } from '../dom';
import { wineHref } from '../nav-origin';

export async function shoppingView(ctx: AppContext): Promise<HTMLElement> {
  const root = h('main', { class: 'view' });

  async function draw(): Promise<void> {
    const [wines, stocks, locations, furniture] = await Promise.all([
      ctx.repo.list('wine'),
      ctx.repo.list('stock'),
      ctx.repo.list('location'),
      ctx.repo.list('furniture'),
    ]);
    const entries = shoppingList(buildRows({ wines, stocks, locations, furniture }));

    const share = async (): Promise<void> => {
      const text = shoppingText(entries);
      try {
        if (navigator.share) await navigator.share({ text });
        else await navigator.clipboard.writeText(text);
        if (!navigator.share) showToast({ message: 'Liste copiée.', ms: 3000 });
      } catch {
        /* partage annulé */
      }
    };

    const items = entries.map(({ row }) => {
      const w = row.wine;
      const { primary, secondary } = wineTitle(w);
      const detail = [row.quantity > 0 ? `${row.quantity} en stock` : 'Plus en stock', w.supplier ? `chez ${w.supplier}` : '', w.purchase_price !== null ? `payée ${formatEuro(w.purchase_price)}` : '']
        .filter(Boolean)
        .join(' · ');
      return h(
        'li',
        { class: 'list__item', 'data-wine-id': w.id },
        h('a', { class: 'grow list__link', href: wineHref(w.id, '/courses') }, h('strong', {}, primary), h('div', { class: 'muted' }, secondary), h('div', { class: 'muted' }, detail)),
        h(
          'button',
          {
            class: 'btn btn--small',
            type: 'button',
            onClick: async () => {
              // « Acheté » : on ajoute les bouteilles à la cave puis on retire la fiche de la liste.
              const added = await openAddStockDialog(ctx, { wine: w, furniture });
              if (added) {
                await ctx.repo.setToBuy(w.id, false);
                await draw();
              }
            },
          },
          'Acheté',
        ),
        h('button', { class: 'btn btn--small', type: 'button', 'aria-label': `Retirer ${primary} de la liste`, onClick: async () => { await ctx.repo.setToBuy(w.id, false); await draw(); } }, 'Retirer'),
      );
    });

    root.replaceChildren(
      pageHeader({ title: 'Liste de courses', subtitle: entries.length === 0 ? null : `${entries.length} fiche${entries.length > 1 ? 's' : ''}`, back: '#/accueil', backLabel: 'Retour à l’accueil' }),
      entries.length === 0
        ? h('div', { class: 'card empty muted' }, 'Rien à racheter. Ajoutez un vin depuis « À racheter » sur l’Accueil ou depuis sa fiche.')
        : h('div', { class: 'stack' }, h('ul', { class: 'card list' }, items), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void share() }, 'Partager la liste')),
    );
  }

  await draw();
  return root;
}
