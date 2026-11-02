// Boîtes de dialogue modales basées sur <dialog> (Safari iOS ≥ 15.4).
import { h } from '../dom';

export interface DialogHandle<T> {
  result: Promise<T | null>;
  close: (value: T | null) => void;
}

/** Ouvre une boîte modale. Le résultat est `null` si elle est fermée sans choix. */
export function openDialog<T>(
  title: string,
  build: (close: (value: T | null) => void) => (HTMLElement | null)[],
  opts: { sheet?: boolean } = {},
): DialogHandle<T> {
  const dlg = document.createElement('dialog');
  dlg.className = opts.sheet ? 'dialog dialog--sheet' : 'dialog';
  let settle!: (v: T | null) => void;
  const result = new Promise<T | null>((r) => (settle = r));
  const close = (value: T | null): void => {
    if (dlg.open || dlg.hasAttribute('open')) {
      try {
        dlg.close();
      } catch {
        dlg.removeAttribute('open');
      }
    }
    dlg.remove();
    settle(value);
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(null);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(null);
  });
  const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.append(
    h('h2', { id: titleId }, title),
    ...build(close).filter((n): n is HTMLElement => n !== null),
  );
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  return { result, close };
}

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  const { result } = openDialog<boolean>(opts.title, (close) => [
    h('p', { class: 'muted' }, opts.message),
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Annuler'),
      h(
        'button',
        { class: `btn btn--primary${opts.danger ? ' btn--danger' : ''}`, type: 'button', onClick: () => close(true) },
        opts.confirmLabel,
      ),
    ),
  ]);
  return result.then((v) => v === true);
}

/** Saisie d'un texte (renommage, création). `null` si annulé. */
export function promptDialog(opts: {
  title: string;
  label: string;
  value?: string;
  confirmLabel: string;
}): Promise<string | null> {
  const { result } = openDialog<string>(opts.title, (close) => {
    const input = h('input', {
      class: 'field__input',
      type: 'text',
      value: opts.value ?? '',
      autocomplete: 'off',
      enterkeyhint: 'done',
    });
    const submit = (): void => close(input.value);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    queueMicrotask(() => input.focus());
    return [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, opts.label), input),
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: submit }, opts.confirmLabel),
      ),
    ];
  });
  return result;
}
