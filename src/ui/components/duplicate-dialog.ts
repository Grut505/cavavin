// Dialogue de doublon : « ajouter une bouteille » ou « compléter la fiche existante » (FR-004).
import type { Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import type { FieldChange } from '../../scan/reconcile';
import { FIELD_LABELS, formatFieldValue } from '../field-labels';
import { h } from '../dom';
import { openDialog } from './dialog';

export type DuplicateChoice =
  | { choice: 'add' }
  | { choice: 'complete'; accepted: Set<string> };

export function askDuplicate(opts: {
  existing: Wine;
  match: 'exact' | 'probable';
  bottles: number;
  changes: FieldChange[];
}): Promise<DuplicateChoice | null> {
  const { existing, changes } = opts;
  const title = opts.match === 'exact' ? 'Cette fiche existe déjà' : 'Une fiche très proche existe déjà';
  const { result } = openDialog<DuplicateChoice>(title, (close) => {
    const boxes = changes.map((c) => {
      const box = h('input', {
        type: 'checkbox',
        id: `chg-${c.field}`,
        ...(c.kind === 'fill' ? { checked: true } : {}),
      });
      return {
        field: c.field,
        box,
        row: h(
          'label',
          { class: 'row', for: `chg-${c.field}`, style: 'min-height:44px' },
          box,
          h(
            'span',
            { class: 'grow' },
            h('strong', {}, FIELD_LABELS[c.field]),
            ' : ',
            c.kind === 'fill'
              ? formatFieldValue(c.field, c.proposed)
              : `${formatFieldValue(c.field, c.current)} → ${formatFieldValue(c.field, c.proposed)}`,
          ),
        ),
      };
    });
    const plural = opts.bottles > 1 ? 'bouteilles' : 'bouteille';
    return [
      h(
        'div',
        { class: 'card' },
        h('strong', {}, wineTitle(existing).primary),
        h('div', { class: 'muted' }, wineTitle(existing).secondary),
        h('div', { class: 'muted' }, `${opts.bottles} ${plural} en stock`),
      ),
      changes.length > 0
        ? h(
            'div',
            { class: 'stack' },
            h('p', { class: 'muted' }, 'Informations à compléter (rien n’est remplacé sans votre accord) :'),
            ...boxes.map((b) => b.row),
          )
        : h('p', { class: 'muted' }, 'Aucune information nouvelle à ajouter à la fiche.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close({ choice: 'add' }) }, 'Ajouter une bouteille'),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            ...(changes.length === 0 ? { disabled: true } : {}),
            onClick: () =>
              close({
                choice: 'complete',
                accepted: new Set(boxes.filter((b) => b.box.checked).map((b) => b.field)),
              }),
          },
          'Compléter la fiche existante',
        ),
        h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler'),
      ),
    ];
  });
  return result;
}
