// Historique des sorties : toutes les bouteilles sorties de la cave, avec motif, date et note.
import type { AppContext } from '../../app';
import { OUTFLOW_REASON_LABELS, outflowsOf } from '../../domain/stock';
import { OUTFLOW_REASONS, type OutflowReason } from '../../domain/types';
import { formatDateFr, wineTitle } from '../../domain/wine';
import { confirmDialog } from '../components/dialog';
import { swipeRow } from '../components/swipe-row';
import { locationLabel } from '../components/location-picker';
import { pageHeader } from '../components/page-header';
import { wineHref } from '../nav-origin';
import { h } from '../dom';

export async function historyView(ctx: AppContext): Promise<HTMLElement> {
  const root = h('main', { class: 'view' });

  async function draw(): Promise<void> {
    const [outflows, wines, locations, furniture] = await Promise.all([
      ctx.repo.list('outflow'),
      ctx.repo.list('wine', true),
      ctx.repo.list('location', true),
      ctx.repo.list('furniture', true),
    ]);
    const list = outflowsOf(outflows);
    const wineById = new Map(wines.map((w) => [w.id, w] as const));
    const locById = new Map(locations.map((l) => [l.id, l] as const));

    const counts = new Map<OutflowReason, number>();
    for (const o of list) counts.set(o.reason, (counts.get(o.reason) ?? 0) + 1);

    const remove = async (id: string, label: string): Promise<void> => {
      const ok = await confirmDialog({
        title: 'Supprimer cette sortie ?',
        message: `${label} sera retirée de l’historique. La bouteille ne revient pas en stock (pour cela, utilisez « Annuler » juste après une sortie).`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      await ctx.repo.remove('outflow', id);
      await draw();
    };

    const rows = list.map((o) => {
      const wine = wineById.get(o.wine_id);
      const loc = locById.get(o.location_id);
      const title = wine ? wineTitle(wine) : { primary: 'Fiche introuvable', secondary: '' };
      const body = [
        h('strong', {}, title.primary),
        wine?.deleted ? h('span', { class: 'badge badge--muted' }, 'Fiche supprimée') : null,
        title.secondary ? h('div', {}, title.secondary) : null,
        h('div', { class: 'muted' }, [OUTFLOW_REASON_LABELS[o.reason], formatDateFr(o.date), loc ? locationLabel(loc, furniture) : ''].filter(Boolean).join(' · ')),
        o.note ? h('div', { class: 'muted' }, o.note) : null,
      ].filter((n): n is HTMLElement => n !== null);
      // Une fiche supprimée reste consultable (la fiche indique qu'elle est supprimée).
      const inner = h(
        'li',
        { class: 'list__item', 'data-wine-id': o.wine_id },
        wine ? h('a', { class: 'grow list__link', href: wineHref(wine.id, '/historique') }, ...body) : h('div', { class: 'grow' }, ...body),
      );
      const label = `La sortie « ${title.primary} » du ${formatDateFr(o.date)}`;
      return h('li', { class: 'list__swipe', 'data-outflow-id': o.id }, swipeRow(inner, [{ label: 'Supprimer', tone: 'danger', run: () => remove(o.id, label) }], { fallback: true }));
    });

    root.replaceChildren(
      pageHeader({
        title: 'Historique',
        subtitle: list.length === 0 ? null : `${list.length} bouteille${list.length > 1 ? 's' : ''} sortie${list.length > 1 ? 's' : ''}`,
        back: '#/reglages',
        backLabel: 'Retour aux réglages',
      }),
      ...(list.length > 0
        ? [
            h(
              'div',
              { class: 'chips', 'aria-label': 'Répartition par motif' },
              OUTFLOW_REASONS.filter((r) => counts.has(r)).map((r) => h('span', { class: 'chip__label' }, `${OUTFLOW_REASON_LABELS[r]} · ${counts.get(r)}`)),
            ),
            h('p', { class: 'muted' }, 'Astuce : glissez une ligne vers la gauche pour la supprimer.'),
          ]
        : []),
      list.length === 0
        ? h('div', { class: 'card empty' }, h('h2', {}, 'Aucune sortie'), h('p', { class: 'muted' }, 'Les bouteilles que vous sortirez de la cave apparaîtront ici.'))
        : h('ul', { class: 'card list list--swipe' }, rows),
    );
  }

  await draw();
  return root;
}
