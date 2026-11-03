// Ligne « à glisser » (mobile) : un balayage vers la gauche révèle des actions (modifier, sortir, supprimer…).
// Souris : pas de balayage ; `fallback` affiche alors les actions en boutons discrets à côté de la ligne.
import { h } from '../dom';

export interface SwipeAction {
  label: string;
  tone?: 'default' | 'danger';
  run: () => void | Promise<void>;
}

const WIDTH = 84; // largeur d'une action, en px
let openRow: { close: () => void } | null = null;

export function swipeRow(content: HTMLElement, actions: SwipeAction[], opts: { fallback?: boolean } = {}): HTMLElement {
  const full = WIDTH * actions.length;
  const front = h('div', { class: 'swipe__front' }, content);
  const buttons = actions.map((a) =>
    h(
      'button',
      {
        class: `swipe__action${a.tone === 'danger' ? ' swipe__action--danger' : ''}`,
        type: 'button',
        tabindex: '-1',
        style: `width:${WIDTH}px`,
        onClick: () => {
          api.close();
          void a.run();
        },
      },
      a.label,
    ),
  );
  const root = h(
    'div',
    { class: `swipe${opts.fallback ? ' swipe--fallback' : ''}` },
    h('div', { class: 'swipe__actions', 'aria-hidden': 'true' }, buttons),
    front,
    opts.fallback
      ? h(
          'div',
          { class: 'swipe__inline' },
          actions.map((a) => h('button', { class: `btn btn--small${a.tone === 'danger' ? ' btn--danger' : ''}`, type: 'button', onClick: () => void a.run() }, a.label)),
        )
      : null,
  );

  let offset = 0;
  let startX = 0;
  let startY = 0;
  let base = 0;
  let tracking = false;
  let dragging = false;
  let swiped = false;

  const set = (x: number, animate: boolean): void => {
    offset = Math.max(-full, Math.min(0, x));
    front.style.transition = animate ? 'transform 0.18s ease' : 'none';
    front.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
    const open = offset <= -full / 2 && animate;
    root.classList.toggle('swipe--open', open || (!animate && offset < 0));
    buttons.forEach((b) => b.setAttribute('tabindex', open ? '0' : '-1'));
    root.querySelector('.swipe__actions')!.setAttribute('aria-hidden', open ? 'false' : 'true');
  };
  const api = {
    close: (): void => {
      set(0, true);
      if (openRow === api) openRow = null;
    },
  };

  front.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    if (openRow && openRow !== api) openRow.close();
    tracking = true;
    dragging = false;
    swiped = false;
    startX = e.clientX;
    startY = e.clientY;
    base = offset;
  });
  front.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        tracking = false; // défilement vertical : on laisse faire
        return;
      }
      if (Math.abs(dx) < 8) return;
      dragging = true;
    }
    swiped = true;
    set(base + dx, false);
  });
  const end = (): void => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    if (offset <= -full / 2) {
      set(-full, true);
      openRow = api;
    } else api.close();
  };
  front.addEventListener('pointerup', end);
  front.addEventListener('pointercancel', end);
  // Un balayage ne doit pas ouvrir la fiche ; une ligne ouverte se referme au toucher.
  front.addEventListener(
    'click',
    (e) => {
      if (swiped || offset < 0) {
        e.preventDefault();
        e.stopPropagation();
        swiped = false;
        if (offset < 0) api.close();
      }
    },
    true,
  );
  return root;
}
