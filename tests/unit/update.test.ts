// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as upd from '../../src/app-update';
import { versionLabel } from '../../src/version';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('version affichée', () => {
  it('formate « vX.Y.Z · commit · date » et omet ce qui manque', () => {
    expect(versionLabel('0.2.0', '4ddf001', '2026-11-02T17:42:00.000Z')).toMatch(/^v0\.2\.0 · 4ddf001 · 02\/11\/2026 \d{2}:\d{2}$/);
    expect(versionLabel('0.2.0', 'local', null)).toBe('v0.2.0 · local');
    expect(versionLabel('0.2.0', '', 'pas une date')).toBe('v0.2.0');
  });
});

/** Faux `registerSW` : expose les rappels pour simuler une version qui arrive. */
function fakeRegister() {
  const hooks: { onNeedRefresh?: () => void; onRegisteredSW?: (u: string, r: ServiceWorkerRegistration | undefined) => void } = {};
  const activate = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const reg = { update, waiting: null } as unknown as ServiceWorkerRegistration;
  const register = vi.fn((o: typeof hooks) => {
    Object.assign(hooks, o);
    return activate;
  });
  return { register: register as unknown as upd.RegisterSW, hooks, activate, update, reg };
}

describe('mises à jour de l’application', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function fresh() {
    return (await import('../../src/app-update')) as typeof upd;
  }

  it('applique tout de suite une version trouvée juste après l’ouverture', async () => {
    const u = await fresh();
    const f = fakeRegister();
    let t = 1000;
    u.startUpdates(f.register, { now: () => t });
    t += 5_000;
    f.hooks.onNeedRefresh!();
    expect(u.updateState().needRefresh).toBe(true);
    expect(f.activate).toHaveBeenCalledWith(true);
  });

  it('propose seulement (sans recharger) une version trouvée plus tard', async () => {
    const u = await fresh();
    const f = fakeRegister();
    let t = 1000;
    u.startUpdates(f.register, { now: () => t });
    t += u.AUTO_APPLY_WITHIN_MS + 1;
    f.hooks.onNeedRefresh!();
    expect(u.updateState().needRefresh).toBe(true);
    expect(f.activate).not.toHaveBeenCalled();
    await u.applyUpdate();
    expect(f.activate).toHaveBeenCalledWith(true);
  });

  it('cherche une mise à jour à l’inscription, au retour au premier plan et au retour du réseau', async () => {
    const u = await fresh();
    const f = fakeRegister();
    u.startUpdates(f.register);
    f.hooks.onRegisteredSW!('sw.js', f.reg);
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(2));
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(3));
    expect(await u.checkForUpdate()).toBe('uptodate');
    expect(u.updateState().checkedAt).not.toBeNull();
  });

  it('« indisponible » sans Service Worker', async () => {
    const u = await fresh();
    expect(await u.checkForUpdate()).toBe('unsupported');
  });

  it('le secours vide les caches et recharge, sans toucher aux données', async () => {
    const u = await fresh();
    const unregister = vi.fn(async () => true);
    const del = vi.fn(async () => true);
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistrations: async () => [{ unregister }] }, configurable: true });
    Object.defineProperty(globalThis, 'caches', { value: { keys: async () => ['a', 'b'], delete: del }, configurable: true });
    const reload = vi.fn();
    await u.forceRefresh(reload);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('le bandeau n’apparaît que quand une version attend, et l’applique au tap', async () => {
    const u = await fresh();
    const { updateBanner: banner } = await import('../../src/ui/components/update-banner');
    const f = fakeRegister();
    u.startUpdates(f.register, { now: (() => { let t = 0; return () => (t += 20_000); })() }); // ouverture « ancienne »
    const apply = vi.fn(async () => undefined);
    const el = banner(apply);
    document.body.append(el);
    expect(el.hasAttribute('hidden')).toBe(true);
    f.hooks.onNeedRefresh!();
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.textContent).toContain('Nouvelle version disponible');
    click(el.querySelector('button'));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('la carte Version montre la version et propose le contrôle manuel et le secours', async () => {
    const { versionCard: card } = await import('../../src/ui/components/version-card');
    const u = await fresh();
    const el = card({ label: 'v0.2.0 · abc1234 · 02/11/2026 18:42' });
    document.body.append(el);
    expect(el.textContent).toContain('v0.2.0 · abc1234');
    expect(el.textContent).toContain('Vérification automatique');
    click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Rechercher une mise à jour'));
    await waitFor(() => expect(el.textContent).toContain('indisponibles ici'));
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Forcer le rafraîchissement'))).toBe(true);
    expect(u.updateState().needRefresh).toBe(false);
  });
});
