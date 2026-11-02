// Fiche personne : bouteilles offertes, en stock et déjà sorties (spec 002, FR-013).
import type { AppContext } from '../../app';
import { giftsOf } from '../../domain/gifts';
import { buildRows } from '../../domain/query';
import { OUTFLOW_REASON_LABELS } from '../../domain/stock';
import { wineTitle, formatDateFr } from '../../domain/wine';
import { pageHeader } from '../components/page-header';
import { renderWineCard } from '../components/wine-card';
import { h } from '../dom';

export async function personView(ctx: AppContext, params: { id?: string }): Promise<HTMLElement> {
  const person = params.id ? await ctx.repo.get('person', params.id) : undefined;
  if (!person) {
    return h(
      'main',
      { class: 'view' },
      pageHeader({ title: 'Personne introuvable', back: '#/personnes', backLabel: 'Retour aux personnes' }),
      h('p', { class: 'muted' }, 'Cette personne n’existe plus.'),
    );
  }
  const [wines, stocks, locations, furniture, outflows, thumbs] = await Promise.all([
    ctx.repo.list('wine'),
    ctx.repo.list('stock'),
    ctx.repo.list('location'),
    ctx.repo.list('furniture'),
    ctx.repo.list('outflow'),
    ctx.repo.thumbnailUrls(),
  ]);
  const rows = buildRows({ wines, stocks, locations, furniture });
  const g = giftsOf(person, rows, outflows);
  const total = g.inStock.length + g.gone.length;

  const stockList =
    g.inStock.length === 0
      ? h('p', { class: 'muted' }, 'Aucune bouteille en stock.')
      : h('div', { class: 'stack' }, g.inStock.map((r) => renderWineCard(r, { href: `#/vin/${r.wine.id}`, thumb: thumbs.get(r.wine.id) })));

  const goneList =
    g.gone.length === 0
      ? h('p', { class: 'muted' }, 'Aucune bouteille sortie.')
      : h(
          'ul',
          { class: 'card list' },
          g.gone.map(({ outflow, wine }) =>
            h(
              'li',
              { class: 'list__item' },
              h(
                'a',
                { class: 'grow list__link', href: `#/vin/${wine.id}` },
                h('strong', {}, wineTitle(wine).primary),
                h('div', { class: 'muted' }, wineTitle(wine).secondary),
              ),
              h('span', { class: 'muted' }, `${OUTFLOW_REASON_LABELS[outflow.reason]} · ${formatDateFr(outflow.date)}`),
            ),
          ),
        );

  return h(
    'main',
    { class: 'view' },
    pageHeader({
      title: person.name,
      subtitle: total === 0 ? 'Aucun cadeau pour l’instant' : `${g.bottlesInStock} en stock · ${g.gone.length} sortie${g.gone.length > 1 ? 's' : ''}`,
      back: '#/personnes',
      backLabel: 'Retour aux personnes',
    }),
    total === 0 ? h('div', { class: 'card empty muted' }, `Aucune bouteille n’est marquée comme offerte par ${person.name}.`) : null,
    total > 0 ? h('section', { class: 'stack' }, h('h2', { class: 'section-title' }, 'En stock'), stockList) : null,
    total > 0 ? h('section', { class: 'stack' }, h('h2', { class: 'section-title' }, 'Déjà sorties'), goneList) : null,
  );
}
