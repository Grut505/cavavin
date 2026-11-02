// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { Router } from '../../src/ui/router';
import { h } from '../../src/ui/dom';

const ctx = {} as AppContext;
beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '#/a';
});

describe('routeur', () => {
  it('affiche un écran d’erreur avec « Réessayer » quand un écran plante', async () => {
    let fail = true;
    const root = h('div');
    document.body.append(root);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new Router(ctx, [{ path: '/a', render: () => (fail ? Promise.reject(new Error('boom')) : h('main', {}, 'ok')) }], '/a').mount(root);
    await vi.waitFor(() => expect(root.textContent).toContain('n’a pas pu s’afficher'));
    fail = false;
    root.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain('ok'));
  });

  it('ignore un rendu lent devenu obsolète', async () => {
    const root = h('div');
    document.body.append(root);
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    new Router(
      ctx,
      [
        { path: '/a', render: async () => (await slow, h('main', {}, 'lent')) },
        { path: '/b', render: () => h('main', {}, 'rapide') },
      ],
      '/a',
    ).mount(root);
    window.location.hash = '#/b';
    await vi.waitFor(() => expect(root.textContent).toContain('rapide'));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(root.textContent).toContain('rapide');
    expect(root.textContent).not.toContain('lent');
  });
});
