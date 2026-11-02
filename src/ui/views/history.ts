// Historique des sorties : toutes les bouteilles sorties de la cave, avec motif, date et note.
import type { AppContext } from '../../app';
import { OUTFLOW_REASON_LABELS, outflowsOf } from '../../domain/stock';
import { OUTFLOW_REASONS, type OutflowReason } from '../../domain/types';
import { formatDateFr, wineTitle } from '../../domain/wine';
import { locationLabel } from '../components/location-picker';
import { pageHeader } from '../components/page-header';
import { wineHref } from '../nav-origin';
import { h } from '../dom';

export async function historyView(ctx: AppContext): Promise<HTMLElement> {
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

  const rows = list.map((o) => {
    const wine = wineById.get(o.wine_id);
    const loc = locById.get(o.location_id);
    const title = wine ? wineTitle(wine) : { primary: 'Fiche supprimée', secondary: '' };
    const body = [
      h('strong', {}, title.primary),
      title.secondary ? h('div', {}, title.secondary) : null,
      h('div', { class: 'muted' }, [OUTFLOW_REASON_LABELS[o.reason], formatDateFr(o.date), loc ? locationLabel(loc, furniture) : ''].filter(Boolean).join(' · ')),
      o.note ? h('div', { class: 'muted' }, o.note) : null,
    ].filter((n): n is HTMLElement => n !== null);
    return h(
      'li',
      { class: 'list__item', 'data-wine-id': o.wine_id },
      wine && !wine.deleted ? h('a', { class: 'grow list__link', href: wineHref(wine.id, '/historique') }, ...body) : h('div', { class: 'grow' }, ...body),
    );
  });

  return h(
    'main',
    { class: 'view' },
    pageHeader({
      title: 'Historique',
      subtitle: list.length === 0 ? null : `${list.length} bouteille${list.length > 1 ? 's' : ''} sortie${list.length > 1 ? 's' : ''}`,
      back: '#/reglages',
      backLabel: 'Retour aux réglages',
    }),
    list.length > 0
      ? h(
          'div',
          { class: 'chips', 'aria-label': 'Répartition par motif' },
          OUTFLOW_REASONS.filter((r) => counts.has(r)).map((r) =>
            h('span', { class: 'chip__label' }, `${OUTFLOW_REASON_LABELS[r]} · ${counts.get(r)}`),
          ),
        )
      : null,
    list.length === 0
      ? h('div', { class: 'card empty' }, h('h2', {}, 'Aucune sortie'), h('p', { class: 'muted' }, 'Les bouteilles que vous sortirez de la cave apparaîtront ici.'))
      : h('ul', { class: 'card list' }, rows),
  );
}
