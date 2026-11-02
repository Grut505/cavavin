// Configuration de la cave : meubles, étagères, lieux (ajout, renommage, suppression gardée).
import type { AppContext } from '../../app';
import {
  LocationRuleError,
  MAX_SHELVES,
  bottleCounts,
  sortByOrder,
} from '../../domain/locations';
import type { Location } from '../../domain/types';
import { askDelete, type MoveTarget } from '../components/delete-location-dialog';
import { promptDialog } from '../components/dialog';
import { pageHeader } from '../components/page-header';
import { h } from '../dom';
import { icon } from '../icons';

export function caveConfigView(ctx: AppContext): HTMLElement {
  const root = h('main', { class: 'view' });
  const alertBox = h('div', { role: 'alert', 'aria-live': 'assertive' });
  const body = h('div', { class: 'stack' });

  const fail = (e: unknown): void => {
    const msg =
      e instanceof LocationRuleError ? e.message : `Une erreur est survenue : ${e instanceof Error ? e.message : String(e)}`;
    alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, msg));
  };

  /** Exécute une action, affiche l'erreur de règle métier éventuelle, puis rafraîchit. */
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    alertBox.replaceChildren();
    try {
      await fn();
    } catch (e) {
      fail(e);
    }
    await refresh();
  };

  async function refresh(): Promise<void> {
    const [furniture, locations, stocks] = await Promise.all([
      ctx.repo.list('furniture'),
      ctx.repo.list('location'),
      ctx.repo.list('stock'),
    ]);
    const counts = bottleCounts(stocks);
    const nameOf = (l: Location): string =>
      l.kind === 'shelf'
        ? `${furniture.find((f) => f.id === l.furniture_id)?.name ?? 'Meuble'} · ${l.name}`
        : l.name;
    const targetsExcluding = (removed: Set<string>): MoveTarget[] =>
      sortByOrder(locations.filter((l) => l.kind !== 'legacy' && !removed.has(l.id))).map((l) => ({
        id: l.id,
        label: nameOf(l),
      }));

    const deleteLocation = async (loc: Location, what: string): Promise<void> => {
      const req = await askDelete({
        what,
        bottles: counts.get(loc.id) ?? 0,
        targets: targetsExcluding(new Set([loc.id])),
      });
      if (req) await run(() => ctx.repo.deleteLocation(loc.id, req.decision));
    };

    const shelfRow = (shelf: Location): HTMLElement =>
      h(
        'li',
        { class: 'list__item' },
        h('span', { class: 'grow' }, shelf.name),
        h('span', { class: 'badge', 'aria-label': `${counts.get(shelf.id) ?? 0} bouteilles` }, String(counts.get(shelf.id) ?? 0)),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost',
            type: 'button',
            'aria-label': `Renommer ${shelf.name}`,
            onClick: async () => {
              const name = await promptDialog({ title: 'Renommer l’étagère', label: 'Nom', value: shelf.name, confirmLabel: 'Enregistrer' });
              if (name !== null) await run(() => ctx.repo.renameLocation(shelf.id, name));
            },
          },
          icon('edit'),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost icon-btn--danger',
            type: 'button',
            'aria-label': `Supprimer ${shelf.name}`,
            onClick: () => void deleteLocation(shelf, `l’étagère « ${shelf.name} »`),
          },
          icon('trash'),
        ),
      );

    const furnitureCards = sortByOrder(furniture).map((f) => {
      const shelves = sortByOrder(locations.filter((l) => l.kind === 'shelf' && l.furniture_id === f.id));
      return h(
        'article',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row' },
          h('h2', { class: 'grow' }, f.name),
          h(
            'button',
            {
              class: 'icon-btn icon-btn--ghost',
              type: 'button',
              'aria-label': `Renommer le meuble ${f.name}`,
              onClick: async () => {
                const name = await promptDialog({ title: 'Renommer le meuble', label: 'Nom', value: f.name, confirmLabel: 'Enregistrer' });
                if (name !== null) await run(() => ctx.repo.renameFurniture(f.id, name));
              },
            },
            icon('edit'),
          ),
          h(
            'button',
            {
              class: 'icon-btn icon-btn--ghost icon-btn--danger',
              type: 'button',
              'aria-label': `Supprimer le meuble ${f.name}`,
              onClick: async () => {
                const ids = new Set(shelves.map((s) => s.id));
                const bottles = shelves.reduce((n, s) => n + (counts.get(s.id) ?? 0), 0);
                const req = await askDelete({ what: `le meuble « ${f.name} »`, bottles, targets: targetsExcluding(ids) });
                if (req) await run(() => ctx.repo.deleteFurniture(f.id, req.decision));
              },
            },
            icon('trash'),
          ),
        ),
        shelves.length === 0
          ? h('p', { class: 'muted' }, 'Aucune étagère.')
          : h('ul', { class: 'list' }, shelves.map(shelfRow)),
        h(
          'button',
          { class: 'btn btn--small', type: 'button', onClick: () => void run(() => ctx.repo.addShelf(f.id)) },
          icon('plus'),
          'Ajouter une étagère',
        ),
      );
    });

    // Formulaire de création de meuble
    const nameInput = h('input', { class: 'field__input', type: 'text', placeholder: 'Ex. Meuble du salon', autocomplete: 'off', required: true });
    const countInput = h('input', {
      class: 'field__input',
      type: 'number',
      inputmode: 'numeric',
      min: '1',
      max: String(MAX_SHELVES),
      value: '5',
    });
    const furnitureForm = h(
      'form',
      {
        class: 'card stack',
        onSubmit: (e: Event) => {
          e.preventDefault();
          void run(() => ctx.repo.createFurniture(nameInput.value, Number(countInput.value)));
        },
      },
      h('h2', {}, 'Nouveau meuble'),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nom'), nameInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, `Nombre d’étagères (1 à ${MAX_SHELVES})`), countInput),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Créer le meuble'),
    );

    // Lieux (pièces, placards…)
    const places = sortByOrder(locations.filter((l) => l.kind === 'place'));
    const placeInput = h('input', { class: 'field__input', type: 'text', placeholder: 'Ex. Cellier', autocomplete: 'off', required: true });
    const placeRows = places.map((p) =>
      h(
        'li',
        { class: 'list__item' },
        h('span', { class: 'grow' }, p.name),
        h('span', { class: 'badge' }, String(counts.get(p.id) ?? 0)),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost',
            type: 'button',
            'aria-label': `Renommer ${p.name}`,
            onClick: async () => {
              const name = await promptDialog({ title: 'Renommer le lieu', label: 'Nom', value: p.name, confirmLabel: 'Enregistrer' });
              if (name !== null) await run(() => ctx.repo.renameLocation(p.id, name));
            },
          },
          icon('edit'),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost icon-btn--danger',
            type: 'button',
            'aria-label': `Supprimer ${p.name}`,
            onClick: () => void deleteLocation(p, `le lieu « ${p.name} »`),
          },
          icon('trash'),
        ),
      ),
    );
    const placesCard = h(
      'form',
      {
        class: 'card stack',
        onSubmit: (e: Event) => {
          e.preventDefault();
          void run(() => ctx.repo.createPlace(placeInput.value));
        },
      },
      h('h2', {}, 'Autres lieux'),
      h('p', { class: 'muted' }, 'Une pièce, un placard… pour stocker des bouteilles hors des meubles.'),
      placeRows.length > 0 ? h('ul', { class: 'list' }, placeRows) : null,
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nouveau lieu'), placeInput),
      h('button', { class: 'btn btn--small', type: 'submit' }, icon('plus'), 'Ajouter le lieu'),
    );

    body.replaceChildren(
      ...(furnitureCards.length > 0 ? [h('h2', { class: 'section-title' }, 'Meubles'), ...furnitureCards] : []),
      furnitureForm,
      placesCard,
    );
  }

  root.append(
    pageHeader({ title: 'Configurer la cave', back: '#/cave', backLabel: 'Retour à la cave' }),
    alertBox,
    body,
  );
  void refresh();
  return root;
}
