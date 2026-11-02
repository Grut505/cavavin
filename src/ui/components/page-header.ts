// En-tête commun, fixe en haut de l'écran : il ne défile pas avec le contenu.
import { h } from '../dom';
import { icon } from '../icons';

export interface PageHeaderOptions {
  title: string;
  subtitle?: string | null;
  /** Lien de retour (hash). */
  back?: string;
  backLabel?: string;
  actions?: (Node | null | undefined | false)[];
}

export function pageHeader(opts: PageHeaderOptions): HTMLElement {
  const actions = (opts.actions ?? []).filter((n): n is Node => !!n);
  return h(
    'header',
    { class: 'app-header' },
    opts.back
      ? h('a', { class: 'icon-btn', href: opts.back, 'aria-label': opts.backLabel ?? 'Retour' }, icon('back'))
      : null,
    h(
      'div',
      { class: 'app-header__title' },
      h('h1', {}, opts.title),
      opts.subtitle ? h('p', { class: 'muted' }, opts.subtitle) : null,
    ),
    actions.length > 0 ? h('div', { class: 'app-header__actions' }, ...actions) : null,
  );
}
