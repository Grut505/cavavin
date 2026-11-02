import { describe, expect, it } from 'vitest';
import { applyChanges, reconcile } from '../../src/scan/reconcile';
import type { ProposalData } from '../../src/scan/proposal';
import type { Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const wine = (over: Partial<Wine> = {}): Wine => ({
  ...wineData({ appellation: 'Saint-Joseph', color: 'rouge', cuvee: 'Les Y', ...over }),
  id: 'w1',
  rev: 1,
  updated_at: '',
  deleted: false,
});

const proposal = (over: Partial<ProposalData> = {}): ProposalData => ({
  target_wine_id: null,
  domain: 'Domaine X',
  cuvee: 'Les Y',
  vintage: 2019,
  appellation: null,
  region: null,
  country: null,
  color: null,
  format: null,
  quantity: null,
  purchase_price: null,
  purchase_date: null,
  supplier: null,
  drink_from: null,
  drink_until: null,
  notes: null,
  tannin: null,
  dryness: null,
  pairings: null,
  raw_json: '{}',
  ...over,
});

describe('reconcile', () => {
  it('propose de remplir les champs vides', () => {
    const changes = reconcile(wine({ region: null }), proposal({ region: 'Rhône', country: 'France' }));
    expect(changes.map((c) => [c.field, c.kind])).toEqual([
      ['region', 'fill'],
      ['country', 'fill'],
    ]);
  });

  it('signale les valeurs différentes sans les imposer', () => {
    const changes = reconcile(wine({ appellation: 'Saint-Joseph' }), proposal({ appellation: 'Crozes-Hermitage' }));
    expect(changes).toEqual([
      { field: 'appellation', current: 'Saint-Joseph', proposed: 'Crozes-Hermitage', kind: 'differ' },
    ]);
  });

  it('ignore les valeurs identiques (hors accents/casse), les valeurs absentes et les champs-clés', () => {
    const changes = reconcile(
      wine({ appellation: 'Saint-Joseph' }),
      proposal({ appellation: 'saint joseph', domain: 'Autre domaine', vintage: 2000, region: null }),
    );
    expect(changes).toEqual([]);
  });

  it('complète une cuvée absente (« — ») mais ne remplace pas une cuvée renseignée', () => {
    expect(reconcile(wine({ cuvee: '—' }), proposal({ cuvee: 'Grande' })).map((c) => c.field)).toEqual(['cuvee']);
    expect(reconcile(wine({ cuvee: 'Les Y' }), proposal({ cuvee: 'Grande' }))).toEqual([]);
  });

  it('propose tanin et sucre quand la fiche ne les a pas, sans remplacer ceux déjà saisis', () => {
    const empty = reconcile(wine(), proposal({ tannin: 4, dryness: 'sec' }));
    expect(empty.map((c) => [c.field, c.kind])).toEqual([['tannin', 'fill'], ['dryness', 'fill']]);
    const set = reconcile(wine({ tannin: 2, dryness: 'doux' }), proposal({ tannin: 4, dryness: 'sec' }));
    expect(set.map((c) => [c.field, c.kind])).toEqual([['tannin', 'differ'], ['dryness', 'differ']]);
  });

  it('applyChanges n’applique que les champs acceptés et jamais le reste', () => {
    const changes = reconcile(
      wine({ region: null, appellation: 'Saint-Joseph' }),
      proposal({ region: 'Rhône', appellation: 'Crozes-Hermitage' }),
    );
    expect(applyChanges(changes, new Set(['region']))).toEqual({ region: 'Rhône' });
    expect(applyChanges(changes, new Set())).toEqual({});
    expect(applyChanges(changes, new Set(['region', 'appellation']))).toEqual({
      region: 'Rhône',
      appellation: 'Crozes-Hermitage',
    });
  });
});
