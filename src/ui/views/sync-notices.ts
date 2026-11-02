// Avis de synchronisation : ce qui a été résolu automatiquement (conflits, quantités plafonnées).
import type { AppContext } from '../../app';
import type { SyncNotice } from '../../domain/types';
import { pageHeader } from '../components/page-header';
import { h } from '../dom';

const KIND_LABELS: Record<SyncNotice['kind'], string> = {
  conflict_lww: 'Modification simultanée',
  clamped: 'Quantité ajustée',
};

export async function syncNoticesView(ctx: AppContext): Promise<HTMLElement> {
  const root = h('main', { class: 'view' });

  async function wineIdOf(n: SyncNotice): Promise<string | null> {
    if (n.entity === 'wine') return (await ctx.repo.get('wine', n.entity_id))?.id ?? null;
    if (n.entity === 'stock') {
      const stock = (await ctx.repo.list('stock', true)).find((s) => s.id === n.entity_id);
      return stock ? ((await ctx.repo.get('wine', stock.wine_id))?.id ?? null) : null;
    }
    return null;
  }

  async function draw(): Promise<void> {
    const notices = [...(await ctx.repo.notices())].sort((a, b) => (a.ts < b.ts ? 1 : -1));
    const cards = await Promise.all(
      notices.map(async (n) => {
        const wineId = await wineIdOf(n);
        return h(
          'article',
          { class: 'card stack', 'data-notice-id': n.id },
          h('div', { class: 'row row--between' }, h('strong', {}, KIND_LABELS[n.kind]), h('span', { class: 'muted' }, new Date(n.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))),
          h('p', {}, n.message),
          h(
            'div',
            { class: 'row' },
            wineId ? h('a', { class: 'btn btn--small', href: `#/vin/${wineId}` }, 'Voir la fiche') : null,
            h(
              'button',
              {
                class: 'btn btn--small',
                type: 'button',
                'aria-label': `Marquer comme lu : ${n.message}`,
                onClick: async () => {
                  await ctx.repo.acknowledgeNotice(n.id);
                  await ctx.scheduler.refresh();
                  await draw();
                },
              },
              'C’est noté',
            ),
          ),
        );
      }),
    );

    root.replaceChildren(
      pageHeader({
        title: 'Avis',
        subtitle: notices.length === 0 ? null : `${notices.length} à lire`,
        back: '#/reglages',
        backLabel: 'Retour aux réglages',
        actions: [
          notices.length > 1
            ? h(
                'button',
                {
                  class: 'btn btn--small',
                  type: 'button',
                  onClick: async () => {
                    await ctx.repo.acknowledgeAllNotices();
                    await ctx.scheduler.refresh();
                    await draw();
                  },
                },
                'Tout acquitter',
              )
            : null,
        ],
      }),
      notices.length === 0
        ? h('div', { class: 'card empty' }, h('h2', {}, 'Aucun avis'), h('p', { class: 'muted' }, 'Quand deux appareils modifient la même fiche, ou qu’une quantité doit être ajustée, l’application vous le dit ici : rien n’est perdu en silence.'))
        : h('p', { class: 'muted' }, 'Ces changements ont été résolus automatiquement lors de la synchronisation.'),
      ...cards,
    );
  }

  await draw();
  return root;
}
