// Message passager en bas d'écran, avec une action facultative (ex. « Annuler »).
import { h } from '../dom';

let current: { el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

export function dismissToast(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}

export function showToast(opts: { message: string; actionLabel?: string; onAction?: () => void | Promise<void>; ms?: number }): void {
  dismissToast();
  const el = h(
    'div',
    { class: 'toast', role: 'status', 'aria-live': 'polite' },
    h('span', {}, opts.message),
    opts.actionLabel
      ? h(
          'button',
          {
            class: 'btn btn--small',
            type: 'button',
            onClick: () => {
              dismissToast();
              void opts.onAction?.();
            },
          },
          opts.actionLabel,
        )
      : null,
  );
  document.body.append(el);
  current = { el, timer: setTimeout(dismissToast, opts.ms ?? 8000) };
}
