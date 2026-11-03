// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/app';
import { URGENCY_ORDER, urgencyByLocation, urgencyOf } from '../../src/domain/urgency';
import type { Stock, Wine } from '../../src/domain/types';
import { openUrgencyLegend } from '../../src/ui/components/urgency-legend';
import { caveView } from '../../src/ui/views/cave';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { contextOf, makeDevice, makeSheet, wineData, wineFields } from '../contract/helpers';

const Y = 2026;
let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `u${++n}` });
const stock = (w: Wine, quantity: number, location = 'L1'): Stock => ({ id: `s${++n}`, rev: 1, updated_at: '', deleted: false, wine_id: w.id, location_id: location, quantity, position_hint: null });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('code couleur d’urgence', () => {
  it('distingue en retard, à finir, à point, bientôt, trop tôt et non évaluée', () => {
    const u = (from: number | null, until: number | null) => urgencyOf({ drink_from: from, drink_until: until }, Y);
    expect(u(2000, 2020)).toBe('late');
    expect(u(2020, 2027)).toBe('finishing');
    expect(u(2020, 2026)).toBe('finishing');
    expect(u(2020, 2040)).toBe('now');
    expect(u(2027, 2040)).toBe('soon');
    expect(u(2035, 2050)).toBe('early');
    expect(u(null, null)).toBe('unknown');
  });

  it('une entrée par bouteille et par emplacement, les plus urgentes d’abord, stocks épuisés ignorés', () => {
    const late = wine({ drink_from: 2000, drink_until: 2010 });
    const now = wine({ drink_from: 2020, drink_until: 2040 });
    const stocks = [stock(now, 2), stock(late, 1), stock(late, 3, 'L2'), { ...stock(now, 5), deleted: true }, stock(now, 0)];
    const m = urgencyByLocation(stocks, [late, now], Y);
    expect(m.get('L1')).toEqual(['late', 'now', 'now']);
    expect(m.get('L2')).toEqual(['late', 'late', 'late']);
    expect(URGENCY_ORDER[0]).toBe('late');
  });
});

describe('cave : couleurs, totaux et légende', () => {
  async function setup() {
    const d = await makeDevice(await makeSheet(), 'dev-urg');
    await d.repo.createFurniture('Armoire', 2);
    const [s1, s2] = (await d.repo.list('location')).filter((l) => l.kind === 'shelf');
    const late = await d.repo.addWine(wineFields({ cuvee: 'Passée', drink_from: 2000, drink_until: 2010 }), [{ location_id: s1!.id, quantity: 2, position_hint: null }]);
    await d.repo.addWine(wineFields({ cuvee: 'À point', drink_from: 2020, drink_until: 2099 }), [{ location_id: s1!.id, quantity: 1, position_hint: null }, { location_id: s2!.id, quantity: 1, position_hint: null }]);
    return { d, ctx: contextOf(d) as AppContext, s1: s1!, late };
  }

  it('colore les bouteilles dessinées selon l’urgence et affiche le total à côté du titre du meuble', async () => {
    const { ctx, s1 } = await setup();
    const el = await caveView(ctx);
    const classes = [...el.querySelector(`[data-location-id="${s1.id}"]`)!.querySelectorAll('.shelf__bottle')].map((b) => b.getAttribute('class'));
    // 3 bouteilles × (col + corps) : les 2 en retard d'abord (rouge), puis 1 à point (vert)
    expect(classes.filter((c) => c?.includes('u-fill--late'))).toHaveLength(4);
    expect(classes.filter((c) => c?.includes('u-fill--now'))).toHaveLength(2);
    expect(el.querySelector('.rack h2')!.textContent).toContain('Armoire');
    expect(el.querySelector('.rack__total')!.textContent).toContain('4 bouteilles');
  });

  it('la légende « i » explique chaque couleur', async () => {
    const { ctx } = await setup();
    const el = await caveView(ctx);
    document.body.append(el);
    (el.querySelector('button[aria-label="Légende des couleurs"]') as HTMLButtonElement).click();
    const dlg = document.querySelector('dialog')!;
    for (const label of ['En retard', 'À finir', 'À point', 'Bientôt', 'Trop tôt', 'Non évaluée']) expect(dlg.textContent).toContain(label);
    expect(dlg.querySelectorAll('.legend__swatch')).toHaveLength(6);
    openUrgencyLegend();
    expect(document.querySelectorAll('dialog').length).toBeGreaterThan(1); // utilisable depuis n'importe quel écran
  });

  it('le schéma de l’étagère colore aussi les bouteilles par urgence', async () => {
    const { ctx, s1 } = await setup();
    const el = await shelfDetailView(ctx, { id: s1.id });
    const fills = [...el.querySelectorAll('.sv__bottle .bottle')].map((b) => b.getAttribute('class')!);
    expect(fills.some((c) => c.includes('u-fill--late'))).toBe(true);
    expect(fills.some((c) => c.includes('u-fill--now'))).toBe(true);
    expect(el.querySelector('.sv__bottle')!.getAttribute('aria-label')).toMatch(/en retard|à point/);
    expect(el.querySelector('button[aria-label="Légende des couleurs"]')).not.toBeNull();
  });
});
