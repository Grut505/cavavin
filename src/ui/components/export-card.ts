// Carte « Exporter ma cave » des Réglages : télécharge un CSV de toutes les fiches.
import type { AppContext } from '../../app';
import { cellarCsv, csvFileName } from '../../domain/export';
import { buildRows } from '../../domain/query';
import { h } from '../dom';

export async function exportCellar(ctx: Pick<AppContext, 'repo'>, download: (name: string, csv: string) => void = browserDownload): Promise<number> {
  const [wines, stocks, locations, furniture, persons] = await Promise.all([
    ctx.repo.list('wine'),
    ctx.repo.list('stock'),
    ctx.repo.list('location'),
    ctx.repo.list('furniture'),
    ctx.repo.list('person', true),
  ]);
  const rows = buildRows({ wines, stocks, locations, furniture });
  download(csvFileName(), cellarCsv(rows, persons));
  return rows.length;
}

function browserDownload(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportCard(ctx: Pick<AppContext, 'repo'>, download?: (name: string, csv: string) => void): HTMLElement {
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const button = h('button', { class: 'btn', type: 'button' }, 'Télécharger le CSV');
  button.addEventListener('click', () => {
    button.setAttribute('disabled', '');
    exportCellar(ctx, download).then(
      (n) => {
        status.textContent = `${n} fiche${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''}.`;
        button.removeAttribute('disabled');
      },
      () => {
        status.textContent = 'Export impossible.';
        button.removeAttribute('disabled');
      },
    );
  });
  return h(
    'section',
    { class: 'card stack', 'aria-label': 'Exporter ma cave' },
    h('h2', {}, 'Exporter ma cave'),
    h('p', { class: 'muted' }, 'Un fichier CSV (Excel, Numbers, Sheets) avec toutes vos fiches : votre propre copie, en plus de la feuille Google.'),
    button,
    status,
  );
}
