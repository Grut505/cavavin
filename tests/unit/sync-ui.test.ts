// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { SyncScheduler, type SyncState, type SyncStatus } from '../../src/data/sync-scheduler';
import {
  decorateWithSyncStatus,
  describeStatus,
  formatLastSync,
  statusMessage,
  syncStatusChip,
} from '../../src/ui/components/sync-status';
import { pageHeader } from '../../src/ui/components/page-header';
import { caveView } from '../../src/ui/views/cave';
import { settingsView } from '../../src/ui/views/settings';
import { syncNoticesView } from '../../src/ui/views/sync-notices';
import { wineListView } from '../../src/ui/views/wine-list';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({ state: 'synced', pending: 0, lastSyncAt: null, notices: 0, message: null, ...over });

/** Ordonnanceur factice dont on contrôle l'état. */
function fakeScheduler(initial: SyncStatus) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    status: () => current,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next: Partial<SyncStatus>) {
      current = { ...current, ...next };
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
    refresh: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => null),
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('libellés d’état', () => {
  it('décrit chaque état : à jour, en attente (n), synchro, hors-ligne, non connecté, refusé, erreur', () => {
    expect(describeStatus(status())).toEqual({ label: 'À jour', tone: 'ok' });
    expect(describeStatus(status({ state: 'pending', pending: 3 }))).toEqual({ label: '3 en attente', tone: 'warn' });
    expect(describeStatus(status({ state: 'syncing' })).label).toBe('Synchro…');
    expect(describeStatus(status({ state: 'offline' })).label).toBe('Hors-ligne');
    expect(describeStatus(status({ state: 'offline', pending: 2 })).label).toBe('Hors-ligne · 2 en attente');
    expect(describeStatus(status({ state: 'auth' }))).toEqual({ label: 'Non connecté', tone: 'bad' });
    expect(describeStatus(status({ state: 'auth', pending: 1 })).label).toBe('Non connecté · 1 en attente');
    expect(describeStatus(status({ state: 'denied' })).label).toBe('Accès refusé');
    expect(describeStatus(status({ state: 'error' })).label).toBe('Erreur');
  });

  it('explique chaque état en une phrase, sans jamais promettre de perte de données', () => {
    const states: SyncState[] = ['synced', 'pending', 'syncing', 'offline', 'auth', 'denied', 'error'];
    for (const state of states) expect(statusMessage(status({ state, pending: 2 })).length, state).toBeGreaterThan(10);
    expect(statusMessage(status({ state: 'offline', pending: 2 }))).toContain('2 modifications seront envoyées');
    expect(statusMessage(status({ state: 'offline', pending: 1 }))).toContain('1 modification sera envoyée');
    expect(statusMessage(status({ state: 'auth' }))).toContain('conservées');
    expect(statusMessage(status({ state: 'error', message: 'Boum' }))).toBe('Boum');
  });

  it('indique la date de dernière synchronisation, ou « jamais »', () => {
    expect(formatLastSync(null)).toBe('Jamais synchronisé');
    expect(formatLastSync('pas une date')).toBe('Jamais synchronisé');
    expect(formatLastSync('2026-11-02T10:05:00Z')).toMatch(/^Dernière synchronisation : 02\/11\/2026/);
  });
});

describe('pastille d’état', () => {
  it('affiche l’état, la dernière synchro en info-bulle, et se met à jour toute seule', () => {
    const sched = fakeScheduler(status({ lastSyncAt: '2026-11-02T10:05:00Z' }));
    const chip = syncStatusChip(sched);
    document.body.append(chip);
    const a = chip.querySelector('a.sync-chip')!;
    expect(a.textContent).toBe('À jour');
    expect(a.getAttribute('data-state')).toBe('synced');
    expect(a.getAttribute('title')).toContain('Dernière synchronisation : 02/11/2026');
    expect(a.getAttribute('href')).toBe('#/reglages');

    sched.set({ state: 'pending', pending: 4 });
    expect(chip.querySelector('a.sync-chip')!.textContent).toBe('4 en attente');
    sched.set({ state: 'offline' });
    expect(chip.querySelector('a.sync-chip')!.textContent).toBe('Hors-ligne · 4 en attente');
    expect(chip.querySelector('a.sync-chip')!.className).toContain('sync-chip--warn');
    sched.set({ state: 'auth' });
    expect(chip.querySelector('a.sync-chip')!.className).toContain('sync-chip--bad');
  });

  it('montre un lien vers les avis quand il y en a', () => {
    const sched = fakeScheduler(status({ notices: 2 }));
    const chip = syncStatusChip(sched);
    expect(chip.querySelector('a[href="#/avis"]')?.textContent).toBe('2 avis');
    sched.set({ notices: 0 });
    expect(chip.querySelector('a[href="#/avis"]')).toBeNull();
  });

  it('se désabonne quand elle quitte l’écran', () => {
    const sched = fakeScheduler(status());
    const chip = syncStatusChip(sched);
    document.body.append(chip);
    sched.set({ state: 'pending', pending: 1 });
    expect(sched.listenerCount()).toBe(1);
    chip.remove();
    sched.set({ state: 'synced' });
    expect(sched.listenerCount()).toBe(0);
  });

  it('s’ajoute à l’en-tête fixe de chaque écran, avec ou sans actions existantes', () => {
    const sched = fakeScheduler(status());
    const withActions = document.createElement('main');
    const btn = document.createElement('button');
    withActions.append(pageHeader({ title: 'A', actions: [btn] }));
    decorateWithSyncStatus(withActions, sched);
    const actions = withActions.querySelector('.app-header__actions')!;
    expect(actions.firstElementChild?.classList.contains('sync-chips')).toBe(true);
    expect(actions.lastElementChild).toBe(btn);

    const bare = document.createElement('main');
    bare.append(pageHeader({ title: 'B' }));
    decorateWithSyncStatus(bare, sched);
    expect(bare.querySelectorAll('.sync-chips')).toHaveLength(1);

    const noHeader = document.createElement('main');
    decorateWithSyncStatus(noHeader, sched);
    expect(noHeader.querySelector('.sync-chips')).toBeNull();
  });
});

describe('réglages : synchronisation', () => {
  async function setup(initial: SyncStatus) {
    const d = await makeDevice(await makeSheet(), 'dev-ui');
    const sched = fakeScheduler(initial);
    const ctx = { repo: d.repo, db: d.db, scheduler: sched } as unknown as AppContext;
    return { ctx, sched };
  }

  it('affiche l’état en direct, la dernière synchro et lance une synchronisation à la demande', async () => {
    const { ctx, sched } = await setup(status({ state: 'offline', pending: 2, lastSyncAt: '2026-11-02T10:05:00Z' }));
    const view = await settingsView(ctx);
    document.body.append(view);
    const section = view.querySelector('section[aria-label="Synchronisation"]')!;
    expect(section.textContent).toContain('Hors-ligne · 2 en attente');
    expect(section.textContent).toContain('Dernière synchronisation : 02/11/2026');
    expect(section.textContent).toContain('2 modifications seront envoyées');

    sched.set({ state: 'synced', pending: 0 });
    expect(section.textContent).toContain('À jour');
    expect(section.textContent).toContain('Tout est à jour');

    click(byText(section, 'button', 'Synchroniser maintenant'));
    expect(sched.syncNow).toHaveBeenCalledTimes(1);
  });

  it('désactive le bouton pendant la synchronisation et signale les avis à lire', async () => {
    const { ctx, sched } = await setup(status({ state: 'syncing', notices: 3 }));
    const view = await settingsView(ctx);
    document.body.append(view);
    const btn = byText(view, 'button', 'Synchronisation…') as HTMLButtonElement;
    expect(btn.hasAttribute('disabled')).toBe(true);
    const link = view.querySelector('a[href="#/avis"]')!;
    expect(link.textContent).toBe('3 avis à lire');
    expect(link.hasAttribute('hidden')).toBe(false);
    sched.set({ state: 'synced', notices: 0 });
    expect(link.hasAttribute('hidden')).toBe(true);
    expect(byText(view, 'button', 'Synchroniser maintenant')?.hasAttribute('disabled')).toBe(false);
  });
});

describe('avis de synchronisation', () => {
  async function withNotices() {
    const sheets = await makeSheet();
    const clock = { t: Date.parse('2026-11-02T10:00:00Z') };
    const a = await makeDevice(sheets, 'dev-A', clock);
    await a.repo.createFurniture('Meuble', 1);
    const shelf = (await a.repo.list('location'))[0]!;
    const wine = await a.repo.addWine(wineFields({ domain: 'Fabre', notes: null }), [{ location_id: shelf.id, quantity: 2, position_hint: null }]);
    await a.repo.sync();
    const b = await makeDevice(sheets, 'dev-B', clock);
    await b.repo.sync();
    const stock = (await a.repo.list('stock'))[0]!;
    // Conflit sur un champ (B plus récent) + quantité plafonnée (3 sorties sur 2 bouteilles).
    await a.repo.updateWine(wine.id, { notes: 'A' });
    clock.t += 60_000;
    await b.repo.updateWine(wine.id, { notes: 'B' });
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null });
    await b.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null, quantity: 2 });
    await a.repo.sync();
    await b.repo.sync();
    const scheduler = fakeScheduler(status());
    return { ctx: { repo: b.repo, db: b.db, scheduler } as unknown as AppContext, repo: b.repo, wine, scheduler };
  }

  it('liste ce qui a été résolu automatiquement, avec la date et un lien vers la fiche', async () => {
    const { ctx, wine } = await withNotices();
    const view = await syncNoticesView(ctx);
    document.body.append(view);
    const cards = [...view.querySelectorAll('article')];
    expect(cards).toHaveLength(2);
    const text = view.textContent!;
    expect(text).toContain('Modification simultanée');
    expect(text).toContain('Quantité ajustée');
    expect(text).toContain('votre version a remplacé l’autre');
    expect(text).toContain('ramenée à 0');
    expect(view.querySelector('.app-header p')?.textContent).toBe('2 à lire');
    expect(cards.every((c) => c.querySelector(`a[href="#/vin/${wine.id}"]`))).toBe(true);
  });

  it('chaque avis peut être acquitté, puis tous d’un coup', async () => {
    const { ctx, repo, scheduler } = await withNotices();
    const view = await syncNoticesView(ctx);
    document.body.append(view);
    click(view.querySelector('article button'));
    await waitFor(() => expect(view.querySelectorAll('article')).toHaveLength(1));
    expect(await repo.notices()).toHaveLength(1);
    expect(scheduler.refresh).toHaveBeenCalled();
    expect(byText(view, 'button', 'Tout acquitter')).toBeUndefined(); // un seul avis restant
  });

  it('« Tout acquitter » vide la liste et affiche l’état vide', async () => {
    const { ctx, repo } = await withNotices();
    const view = await syncNoticesView(ctx);
    document.body.append(view);
    click(byText(view, 'button', 'Tout acquitter'));
    await waitFor(() => expect(view.textContent).toContain('Aucun avis'));
    expect(await repo.notices()).toEqual([]);
    expect(view.querySelector('article')).toBeNull();
  });

  it('un état vide explique à quoi servent les avis', async () => {
    const d = await makeDevice(await makeSheet(), 'x');
    const ctx = { repo: d.repo, db: d.db, scheduler: fakeScheduler(status()) } as unknown as AppContext;
    const view = await syncNoticesView(ctx);
    expect(view.textContent).toContain('Aucun avis');
    expect(view.textContent).toContain('rien n’est perdu en silence');
  });
});

describe('parcours hors-ligne complet', () => {
  it('consulte et modifie sans réseau, voit « en attente », puis tout part seul au retour du réseau', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location'))[0]!;
    await d.repo.addWine(wineFields({ domain: 'Déjà synchronisée' }), [{ location_id: shelf.id, quantity: 3, position_hint: null }]);
    await d.repo.sync();

    // L'appareil perd le réseau (et la feuille devient injoignable).
    const net = { online: false };
    sheets.offline = true;
    const events = new EventTarget();
    const scheduler = new SyncScheduler({
      repo: d.repo,
      hasToken: () => true,
      isOnline: () => net.online,
      events,
      debounceMs: 10,
      minIntervalMs: 10,
    });
    const ctx = { repo: d.repo, db: d.db, scheduler } as unknown as AppContext;
    scheduler.start();
    await scheduler.refresh();

    // 1. La cave et la liste s'affichent à partir des données locales.
    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card')).toHaveLength(1));
    expect((await caveView(ctx)).textContent).toContain('3 bouteilles');

    // 2. Il ajoute une fiche et sort une bouteille : conservé, signalé « en attente », rien n'est envoyé.
    const wine = await d.repo.addWine(wineFields({ domain: 'Ajoutée hors-ligne', cuvee: 'Z' }), [{ location_id: shelf.id, quantity: 2, position_hint: null }]);
    await d.repo.recordOutflow((await d.repo.list('stock'))[0]!.id, { reason: 'drunk', date: '2026-11-01', note: null });
    await scheduler.refresh();
    const chip = syncStatusChip(scheduler);
    document.body.append(chip);
    expect(scheduler.status().state).toBe('offline');
    expect(chip.querySelector('a.sync-chip')!.textContent).toMatch(/^Hors-ligne · \d+ en attente$/);
    await waitFor(() => expect(list.querySelectorAll('.wine-card')).toHaveLength(2));
    expect(sheets.records('Vins')).toHaveLength(1);

    // 3. Le réseau revient : synchronisation automatique, l'indicateur repasse à « À jour ».
    net.online = true;
    sheets.offline = false;
    events.dispatchEvent(new Event('online'));
    await waitFor(() => expect(scheduler.status().state).toBe('synced'));
    expect(chip.querySelector('a.sync-chip')!.textContent).toBe('À jour');
    expect(scheduler.status().pending).toBe(0);
    expect(scheduler.status().lastSyncAt).toBeTruthy();
    expect(sheets.records('Vins')).toHaveLength(2);
    expect(sheets.records('Vins').find((v) => v.id === wine.id)).toMatchObject({ domain: 'Ajoutée hors-ligne' });
    expect(sheets.records('Sorties')).toHaveLength(1);
    scheduler.stop();
  });
});

describe('bandeau « Reconnecter »', () => {
  it('n’apparaît qu’en état « non connecté » et relance la connexion au tap', async () => {
    const { reconnectBanner } = await import('../../src/ui/components/reconnect-banner');
    const sched = fakeScheduler(status());
    const signIn = vi.fn(async () => 'token');
    const el = reconnectBanner(sched, { signIn });
    document.body.append(el);
    expect(el.hasAttribute('hidden')).toBe(true);

    sched.set({ state: 'auth', pending: 2 });
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.textContent).toContain('2 modifications conservées');
    click(el.querySelector('button'));
    expect(signIn).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(el.querySelector('button')?.hasAttribute('disabled')).toBe(false));
    sched.set({ state: 'synced', pending: 0 });
    expect(el.hasAttribute('hidden')).toBe(true);
  });
});

describe('écran « accès refusé »', () => {
  it('annonce le refus et efface les données locales au changement de compte', async () => {
    const { accessDeniedView } = await import('../../src/ui/views/access-denied');
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-denied');
    const ctx = contextOf(d);
    const el = await accessDeniedView(ctx);
    expect(el.textContent).toContain('Accès refusé');
    click(el.querySelector('button'));
    await waitFor(async () => expect(await d.db.getMeta('sheet_ready')).toBeUndefined());
    expect(window.location.hash).toBe('#/connexion');
  });
});
