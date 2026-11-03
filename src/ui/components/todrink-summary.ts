// Bouton « À boire » de la Cave : résumé visuel (barre proportionnelle + compteurs) des bouteilles en retard,
// à finir, à point et à attendre. Un tap ouvre l'écran Stats sur le bloc « À boire ».
import { urgencyCounts, waitingCount, URGENCY_LABELS, type Urgency } from '../../domain/urgency';
import type { Stock, Wine } from '../../domain/types';
import { h } from '../dom';

const BAR: Urgency[] = ['late', 'finishing', 'now', 'soon', 'early'];

export function todrinkSummary(stocks: Stock[], wines: Wine[], year: number): HTMLElement {
  const c = urgencyCounts(stocks, wines, year);
  const waiting = waitingCount(c);
  const total = BAR.reduce((n, u) => n + c[u], 0);
  const counters = [
    { label: URGENCY_LABELS.late, n: c.late },
    { label: URGENCY_LABELS.finishing, n: c.finishing },
    { label: URGENCY_LABELS.now, n: c.now },
    { label: 'À attendre', n: waiting },
  ];
  const spoken = total === 0 ? 'aucune bouteille' : counters.map((x) => `${x.n} ${x.label.toLowerCase()}`).join(', ');
  return h(
    'a',
    { class: 'cave-todrink', href: '#/stats?go=a-boire', 'aria-label': `À boire : ${spoken}. Ouvrir le détail.` },
    h(
      'div',
      { class: 'cave-todrink__bar', 'aria-hidden': 'true' },
      total === 0
        ? h('span', { class: 'cave-todrink__seg u-fill--unknown', style: 'flex:1' }, '0')
        : BAR.filter((u) => c[u] > 0).map((u) => h('span', { class: `cave-todrink__seg u-fill--${u}`, style: `flex:${c[u]}`, title: `${URGENCY_LABELS[u]} : ${c[u]}` }, String(c[u]))),
    ),
  );
}
