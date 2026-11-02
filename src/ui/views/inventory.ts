// Pointage d'une étagère : on indique combien de bouteilles on trouve vraiment ; seuls les écarts sont corrigés.
import type { AppContext } from '../../app';
import { countDiffs, parseCount } from '../../domain/inventory';
import { stocksAt } from '../../domain/locations';
import { wineTitle } from '../../domain/wine';
import { confirmDialog } from '../components/dialog';
import { pageHeader } from '../components/page-header';
import { showToast } from '../components/toast';
import { h } from '../dom';

export async function inventoryView(ctx: AppContext, params: { id?: string }): Promise<HTMLElement> {
  const loc = params.id ? await ctx.repo.get('location', params.id) : undefined;
  if (!loc || loc.deleted) {
    return h(
      'main',
      { class: 'view' },
      pageHeader({ title: 'Emplacement introuvable', back: '#/cave', backLabel: 'Retour à la cave' }),
      h('p', { class: 'muted' }, 'Cet emplacement n’existe plus.'),
    );
  }
  const [stocksAll, wines] = await Promise.all([ctx.repo.list('stock'), ctx.repo.list('wine')]);
  const stocks = stocksAt(stocksAll, loc.id);
  const wineOf = new Map(wines.map((w) => [w.id, w] as const));
  const counted = new Map<string, number>(stocks.map((s) => [s.id, s.quantity]));
  const back = `#/etagere/${loc.id}`;

  const summary = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const validate = h('button', { class: 'btn btn--primary', type: 'button' }, 'Valider le pointage');
  const refresh = (): void => {
    const n = countDiffs(stocks, counted).length;
    summary.textContent = n === 0 ? 'Aucun écart pour l’instant.' : `${n} écart${n > 1 ? 's' : ''} à corriger.`;
  };

  const rows = stocks.map((st) => {
    const wine = wineOf.get(st.wine_id);
    const title = wine ? wineTitle(wine) : { primary: 'Fiche introuvable', secondary: '' };
    const value = h('input', { class: 'field__input inv__count', type: 'number', inputmode: 'numeric', min: '0', max: '999', value: String(st.quantity), 'aria-label': `Bouteilles trouvées : ${title.primary}` });
    const set = (n: number | null): void => {
      if (n === null) return;
      counted.set(st.id, n);
      value.value = String(n);
      row.classList.toggle('inv__row--diff', n !== st.quantity);
      refresh();
    };
    value.addEventListener('input', () => {
      const n = parseCount(value.value);
      if (n !== null) {
        counted.set(st.id, n);
        row.classList.toggle('inv__row--diff', n !== st.quantity);
        refresh();
      }
    });
    const step = (d: number): void => set(Math.max(0, Math.min(999, (counted.get(st.id) ?? 0) + d)));
    const row = h(
      'li',
      { class: 'list__item inv__row', 'data-stock-id': st.id },
      h('div', { class: 'grow' }, h('strong', {}, title.primary), h('div', { class: 'muted' }, `${title.secondary} · enregistré ×${st.quantity}`)),
      h('button', { class: 'btn btn--small', type: 'button', 'aria-label': `Une de moins : ${title.primary}`, onClick: () => step(-1) }, '−'),
      value,
      h('button', { class: 'btn btn--small', type: 'button', 'aria-label': `Une de plus : ${title.primary}`, onClick: () => step(1) }, '+'),
    );
    return row;
  });

  validate.addEventListener('click', async () => {
    const diffs = countDiffs(stocks, counted);
    if (diffs.length === 0) {
      showToast({ message: 'Rien à corriger : tout correspond.', ms: 3000 });
      window.location.hash = back;
      return;
    }
    const lines = diffs.map((d) => {
      const w = wineOf.get(d.wineId);
      return `${w ? wineTitle(w).primary : 'Fiche'} : ${d.recorded} → ${d.counted} (${d.delta > 0 ? '+' : ''}${d.delta})`;
    });
    const ok = await confirmDialog({
      title: 'Corriger le stock ?',
      message: `${lines.join(' ; ')}. Les corrections ne sont pas comptées comme des bouteilles bues.`,
      confirmLabel: 'Corriger',
    });
    if (!ok) return;
    validate.setAttribute('disabled', '');
    for (const d of diffs) await ctx.repo.adjustStock(d.stockId, d.delta);
    showToast({ message: `${diffs.length} écart${diffs.length > 1 ? 's' : ''} corrigé${diffs.length > 1 ? 's' : ''}.`, ms: 4000 });
    window.location.hash = back;
  });
  refresh();

  return h(
    'main',
    { class: 'view' },
    pageHeader({ title: `Pointage · ${loc.name}`, subtitle: 'Combien en trouvez-vous vraiment ?', back, backLabel: 'Retour à l’étagère' }),
    stocks.length === 0
      ? h('div', { class: 'card empty muted' }, 'Aucune bouteille enregistrée ici.')
      : h('div', { class: 'stack' }, h('ul', { class: 'card list' }, rows), summary, validate),
    h('a', { class: 'btn btn--small', href: '#/ajouter/saisie' }, 'Une bouteille n’est pas listée ? L’ajouter'),
  );
}
