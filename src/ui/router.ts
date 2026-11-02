// Routeur par hash (compatible GitHub Pages) + barre de navigation basse.
import type { AppContext } from '../app';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { originPath } from './nav-origin';

export type Params = Record<string, string>;

export interface Route {
  /** Chemin, avec paramètres éventuels : `/etagere/:id`. */
  path: string;
  /** Onglet de navigation à mettre en évidence pour un sous-écran. */
  parent?: string;
  nav?: { label: string; icon: IconName };
  /** L'onglet allumé est celui de l'écran d'origine (`?from=`), pas celui du parent (ex. une fiche ouverte depuis la cave). */
  followsOrigin?: boolean;
  render: (ctx: AppContext, params: Params) => Promise<HTMLElement> | HTMLElement;
}

function match(route: Route, path: string): Params | null {
  const a = route.path.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Params = {};
  for (let i = 0; i < a.length; i++) {
    const seg = a[i]!;
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(b[i]!);
    else if (seg !== b[i]) return null;
  }
  return params;
}

export class Router {
  private root!: HTMLElement;
  private ticket = 0;

  constructor(
    private readonly ctx: AppContext,
    private readonly routes: Route[],
    private readonly fallback: string,
    /** Chemins affichés sans barre de navigation (ex. connexion). */
    private readonly bare: string[] = [],
    /** Appelé sur chaque écran rendu, avant son affichage (ex. indicateur de synchronisation). */
    private readonly decorate?: (view: HTMLElement) => void,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    window.addEventListener('hashchange', () => void this.render());
    void this.render();
  }

  static go(path: string): void {
    window.location.hash = `#${path}`;
  }

  private resolve(): { route: Route; params: Params; path: string } {
    const path = window.location.hash.replace(/^#/, '').split('?')[0] ?? '';
    for (const route of this.routes) {
      const params = match(route, path);
      if (params) return { route, params, path };
    }
    const route = this.routes.find((r) => r.path === this.fallback)!;
    return { route, params: {}, path: this.fallback };
  }

  private async render(): Promise<void> {
    const { route, params, path } = this.resolve();
    const ticket = ++this.ticket;
    let view: HTMLElement;
    try {
      view = await route.render(this.ctx, params);
    } catch (e) {
      console.error(e);
      view = h(
        'main',
        { class: 'view view--centered' },
        h('div', { class: 'card empty', role: 'alert' }, h('h2', {}, 'Cet écran n’a pas pu s’afficher'), h('p', { class: 'muted' }, 'Vos données sont intactes.'), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void this.render() }, 'Réessayer')),
      );
    }
    if (ticket !== this.ticket) return; // une navigation plus récente a pris le relais
    this.decorate?.(view);
    const nav = this.bare.includes(path) ? [] : [this.buildNav(this.activeTab(route))];
    this.root.replaceChildren(view, ...nav);
    window.scrollTo(0, 0);
  }

  /** Chemin de l'onglet à allumer : celui de l'origine si la route le demande, sinon celui du parent. */
  private activeTab(route: Route): string {
    if (route.followsOrigin) {
      const from = originPath();
      const origin = from ? this.routes.find((r) => match(r, from) !== null) : undefined;
      if (origin) return origin.parent ?? origin.path;
    }
    return route.parent ?? route.path;
  }

  private buildNav(current: string): HTMLElement {
    return h(
      'nav',
      { class: 'nav', 'aria-label': 'Navigation principale' },
      this.routes
        .filter((r) => r.nav)
        .map((r) =>
          h(
            'a',
            { href: `#${r.path}`, ...(r.path === current ? { 'aria-current': 'page' } : {}) },
            icon(r.nav!.icon),
            r.nav!.label,
          ),
        ),
    );
  }
}
