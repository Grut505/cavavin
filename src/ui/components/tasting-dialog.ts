// « Votre avis ? » après avoir bu une bouteille : note de 1 à 5 et commentaire (alimente « À racheter »).
import type { AppContext } from '../../app';
import type { Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { openDialog } from './dialog';

/** `true` si un avis a été enregistré. */
export function openTastingDialog(
  ctx: Pick<AppContext, 'repo'>,
  opts: { wine: Wine; outflowIds: string[]; note?: string | null },
): Promise<boolean> {
  const title = wineTitle(opts.wine);
  const { result } = openDialog<boolean>('Votre avis ?', (close) => {
    let rating = opts.wine.rating;
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Note de 1 à 5' });
    const paint = (): void => {
      stars.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) =>
          h(
            'button',
            {
              class: `stars__btn${rating !== null && n <= rating ? ' stars__btn--on' : ''}`,
              type: 'button',
              role: 'radio',
              'aria-checked': String(rating === n),
              'aria-label': `${n} sur 5`,
              onClick: () => {
                rating = rating === n ? null : n;
                paint();
              },
            },
            rating !== null && n <= rating ? '★' : '☆',
          ),
        ),
      );
    };
    paint();
    const comment = h('textarea', { class: 'field__input', id: 'tasting-note', rows: '3', placeholder: 'Facultatif : avec quoi, impressions…', 'aria-label': 'Commentaire' });
    comment.value = opts.note ?? '';
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, 'Enregistrer');
    save.addEventListener('click', async () => {
      save.setAttribute('disabled', '');
      try {
        if (rating !== opts.wine.rating) await ctx.repo.patch('wine', opts.wine.id, { rating });
        const text = comment.value.trim();
        if (text !== (opts.note ?? '') && opts.outflowIds[0]) await ctx.repo.patch('outflow', opts.outflowIds[0], { note: text === '' ? null : text });
        close(true);
      } catch {
        save.removeAttribute('disabled');
      }
    });
    return [
      h('p', { class: 'muted' }, `${title.primary} · ${title.secondary}`),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Note'), stars),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Commentaire'), comment),
      h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Plus tard'), save),
    ];
  });
  return result.then((v) => v === true);
}
