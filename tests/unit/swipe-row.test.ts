// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { swipeRow } from '../../src/ui/components/swipe-row';

const ptr = (el: Element, type: string, x: number, y = 0): void => {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  el.dispatchEvent(e);
};

describe('swipeRow', () => {
  const make = () => {
    const link = document.createElement('a');
    link.href = '#/x';
    link.textContent = 'fiche';
    const run = vi.fn();
    const root = swipeRow(link, [{ label: 'Modifier', run }, { label: 'Sortir', run: vi.fn() }]);
    document.body.append(root);
    return { root, link, run, front: root.querySelector<HTMLElement>('.swipe__front')! };
  };

  it('un balayage vers la gauche révèle les actions et bloque l’ouverture de la fiche', () => {
    const { root, link, front, run } = make();
    ptr(front, 'pointerdown', 200);
    ptr(front, 'pointermove', 120);
    ptr(front, 'pointermove', 20);
    ptr(front, 'pointerup', 20);
    expect(front.style.transform).toBe('translateX(-190px)'); // « Modifier » (92 px) + « Sortir » (74 px) + 3 espaces de 8 px
    expect(root.classList.contains('swipe--open')).toBe(true);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    root.querySelector<HTMLButtonElement>('.swipe__action')!.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(front.style.transform).toBe(''); // refermé après l'action
  });

  it('un petit mouvement ou un défilement vertical ne fait rien', () => {
    const { root, front } = make();
    ptr(front, 'pointerdown', 200, 0);
    ptr(front, 'pointermove', 195, 40);
    ptr(front, 'pointerup', 195, 40);
    expect(front.style.transform).toBe('');
    expect(root.classList.contains('swipe--open')).toBe(false);
  });

  it('à moitié tiré, la ligne se referme', () => {
    const { front } = make();
    ptr(front, 'pointerdown', 200);
    ptr(front, 'pointermove', 150);
    ptr(front, 'pointerup', 150);
    expect(front.style.transform).toBe('');
  });
});
