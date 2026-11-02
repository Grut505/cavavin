// Accueil : « À boire » en premier, puis « Quoi boire ce soir ? » et les statistiques globales (spec 002).
import type { AppContext } from '../../app';
import { MATURITY_HINTS, MATURITY_LABELS, maturityGroups, windowText, type Maturity, type MaturityEntry } from '../../domain/maturity';
import { buildOccasionPrompt } from '../../domain/occasion';
import { buildRows, type WineRow } from '../../domain/query';
import {
  cellarValue,
  consumption,
  distribution,
  formatEuro,
  monthLabel,
  overview,
  topSlices,
  type Axis,
  type Slice,
} from '../../domain/stats';
import { OUTFLOW_REASON_LABELS } from '../../domain/stock';
import { OUTFLOW_REASONS, type Outflow } from '../../domain/types';
import { pageHeader } from '../components/page-header';
import { colorLabel, renderWineCard } from '../components/wine-card';
import { h } from '../dom';
import './home.css';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
const bottles = (n: number): string => plural(n, 'bouteille', 'bouteilles');
const PAGE = 10;

// --- À boire ---

function entryRow(e: MaturityEntry, thumbs: Map<string, string>, year: number): HTMLElement {
  const w = e.row.wine;
  const window = windowText(w);
  const note = [window ? `Garde : ${window}` : '', e.info.finishing ? 'à finir' : '', e.info.category === 'late' && w.drink_until !== null ? `dépassée depuis ${year - w.drink_until} an${year - w.drink_until > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    { class: 'tbd__item' },
    renderWineCard(e.row, { href: `#/vin/${w.id}`, thumb: thumbs.get(w.id) }),
    note ? h('p', { class: `tbd__note${e.info.finishing || e.info.category === 'late' ? ' tbd__note--urgent' : ''}` }, note) : null,
  );
}

function toDrinkSection(rows: WineRow[], thumbs: Map<string, string>, year: number): HTMLElement {
  const groups = maturityGroups(rows, year).filter((g) => g.entries.length > 0);
  const section = h('section', { class: 'home__section', 'aria-labelledby': 'h-tbd' }, h('h2', { id: 'h-tbd' }, 'À boire'));
  if (groups.length === 0) {
    section.append(
      h(
        'div',
        { class: 'card empty' },
        h('p', { class: 'muted' }, 'Aucune bouteille en stock pour l’instant.'),
        h('a', { class: 'btn btn--primary', href: '#/ajouter' }, 'Ajouter une bouteille'),
      ),
    );
    return section;
  }
  for (const g of groups) {
    const list = h('ul', { class: 'tbd__list' });
    let shown = 0;
    const more = h('button', { class: 'btn btn--small', type: 'button' });
    const showMore = (): void => {
      for (const e of g.entries.slice(shown, shown + PAGE)) list.append(entryRow(e, thumbs, year));
      shown = Math.min(g.entries.length, shown + PAGE);
      const left = g.entries.length - shown;
      more.textContent = `Afficher ${plural(left, 'fiche restante', 'fiches restantes')}`;
      more.toggleAttribute('hidden', left === 0);
    };
    more.addEventListener('click', showMore);
    showMore();
    section.append(
      h(
        'details',
        { class: `tbd tbd--${g.category}`, ...(g.category === 'late' || g.category === 'now' ? { open: true } : {}) },
        h(
          'summary',
          { class: 'tbd__summary' },
          h('span', { class: 'tbd__title' }, MATURITY_LABELS[g.category]),
          h('span', { class: 'badge', 'aria-label': bottles(g.bottles) }, String(g.bottles)),
          h('span', { class: 'tbd__hint muted' }, MATURITY_HINTS[g.category]),
        ),
        list,
        more,
      ),
    );
  }
  return section;
}

// --- Quoi boire ce soir ? ---

function occasionSection(rows: WineRow[], year: number): HTMLElement {
  const area = h('textarea', {
    class: 'field__input',
    rows: '2',
    id: 'occasion',
    placeholder: 'Ex. magret de canard, 4 personnes, autour de 30 €…',
    style: 'min-height:72px;padding:12px',
  });
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const out = h('textarea', { class: 'field__input', readonly: true, rows: '8', 'aria-label': 'Prompt pour Claude', style: 'font-size:0.8rem;font-family:ui-monospace,monospace' });
  const details = h('details', { hidden: true }, h('summary', { style: 'min-height:44px;display:flex;align-items:center;cursor:pointer' }, 'Voir le prompt'), out);

  const prepare = async (): Promise<void> => {
    const p = buildOccasionPrompt(area.value, rows, year);
    if (p.included === 0) {
      status.textContent = 'Aucune bouteille en stock : rien à proposer à Claude.';
      return;
    }
    out.value = p.text;
    details.removeAttribute('hidden');
    const note = p.truncated ? ` La liste est limitée aux ${p.included} bouteilles les plus urgentes sur ${p.total}.` : '';
    try {
      await navigator.clipboard.writeText(p.text);
      status.textContent = `Prompt copié. Collez-le dans votre projet Claude.${note}`;
    } catch {
      details.setAttribute('open', '');
      out.focus();
      out.select();
      status.textContent = `Copie automatique impossible : le texte est sélectionné, copiez-le à la main.${note}`;
    }
  };

  return h(
    'section',
    { class: 'home__section', 'aria-labelledby': 'h-occ' },
    h('h2', { id: 'h-occ' }, 'Quoi boire ce soir ?'),
    h(
      'div',
      { class: 'card stack' },
      h('label', { class: 'field', for: 'occasion' }, h('span', { class: 'field__label' }, 'Occasion, plat, convives, budget'), area),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void prepare() }, 'Préparer le prompt pour Claude'),
      status,
      details,
    ),
  );
}

// --- Statistiques ---

function bars(slices: Slice[], total: number, label: (s: Slice) => string = (s) => s.label): HTMLElement {
  const max = Math.max(1, ...slices.map((s) => s.bottles));
  return h(
    'ul',
    { class: 'bars' },
    slices.map((s) =>
      h(
        'li',
        { class: 'bars__row' },
        h('span', { class: 'bars__label' }, label(s)),
        h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: 'bars__fill', style: `width:${Math.max(3, Math.round((s.bottles / max) * 100))}%` })),
        h('span', { class: 'bars__value', 'aria-label': `${bottles(s.bottles)}, ${Math.round((s.bottles / Math.max(1, total)) * 100)} %` }, String(s.bottles)),
      ),
    ),
  );
}

const AXES: { axis: Axis; title: string; top: number }[] = [
  { axis: 'color', title: 'Par couleur', top: 6 },
  { axis: 'country', title: 'Par pays', top: 6 },
  { axis: 'region', title: 'Par région', top: 8 },
  { axis: 'vintage', title: 'Par millésime', top: 8 },
  { axis: 'appellation', title: 'Par appellation', top: 8 },
];

function statsSection(rows: WineRow[], outflows: Outflow[], year: number, now: Date): HTMLElement {
  const ov = overview(rows);
  const section = h('section', { class: 'home__section', 'aria-labelledby': 'h-stats' }, h('h2', { id: 'h-stats' }, 'Statistiques'));
  if (ov.bottles === 0 && outflows.length === 0) {
    section.append(h('div', { class: 'card empty muted' }, 'Les statistiques apparaîtront dès que la cave contiendra des bouteilles.'));
    return section;
  }
  const value = cellarValue(rows);
  const tile = (label: string, v: string, sub?: string): HTMLElement =>
    h('div', { class: 'tile' }, h('dt', { class: 'muted' }, label), h('dd', {}, v, sub ? h('small', { class: 'muted' }, sub) : null));

  section.append(
    h(
      'dl',
      { class: 'tiles card' },
      tile('Bouteilles', String(ov.bottles)),
      tile('Fiches', String(ov.wines)),
      tile('Valeur d’achat', value.pricedBottles > 0 ? formatEuro(value.total) : '—', value.unpricedWines > 0 ? `${plural(value.unpricedWines, 'fiche sans prix', 'fiches sans prix')}, non comptée${value.unpricedWines > 1 ? 's' : ''}` : undefined),
      tile('Prix moyen', value.average !== null ? formatEuro(value.average) : '—', value.average !== null ? 'par bouteille' : undefined),
    ),
  );

  // Maturité
  const mat = maturityGroups(rows, year);
  const matSlices: Slice[] = mat.filter((g) => g.bottles > 0).map((g) => ({ label: MATURITY_LABELS[g.category as Maturity], bottles: g.bottles, wines: g.entries.length }));
  if (matSlices.length > 0) section.append(h('div', { class: 'card' }, h('h3', {}, 'Maturité'), bars(matSlices, ov.bottles)));

  // Répartitions
  for (const { axis, title, top } of AXES) {
    const slices = topSlices(distribution(rows, axis), top);
    if (slices.length === 0) continue;
    section.append(h('div', { class: 'card' }, h('h3', {}, title), bars(slices, ov.bottles, axis === 'color' ? (s) => colorLabel(s.label) || s.label : undefined)));
  }

  // Consommation
  const c = consumption(outflows, now);
  const maxM = Math.max(1, ...c.months.map((m) => m.count));
  section.append(
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Consommation (12 derniers mois)'),
      c.total === 0
        ? h('p', { class: 'muted' }, 'Aucune sortie enregistrée sur cette période.')
        : [
            h(
              'ol',
              { class: 'cols', 'aria-label': 'Bouteilles sorties par mois' },
              c.months.map((m) =>
                h(
                  'li',
                  { class: 'cols__item', 'aria-label': `${monthLabel(m.month)} : ${bottles(m.count)}` },
                  h('span', { class: 'cols__value', 'aria-hidden': 'true' }, m.count > 0 ? String(m.count) : ''),
                  h('span', { class: 'cols__bar', 'aria-hidden': 'true', style: `height:${m.count === 0 ? 2 : Math.max(6, Math.round((m.count / maxM) * 64))}px` }),
                  h('span', { class: 'cols__label', 'aria-hidden': 'true' }, monthLabel(m.month).split(' ')[0]!),
                ),
              ),
            ),
            h('p', { class: 'muted' }, `${bottles(c.total)} sortie${c.total > 1 ? 's' : ''} : ${OUTFLOW_REASONS.filter((r) => c.byReason[r] > 0).map((r) => `${c.byReason[r]} ${OUTFLOW_REASON_LABELS[r].toLowerCase()}`).join(', ')}.`),
          ],
    ),
  );
  return section;
}

export async function homeView(ctx: AppContext): Promise<HTMLElement> {
  const [wines, stocks, locations, furniture, outflows, thumbs] = await Promise.all([
    ctx.repo.list('wine'),
    ctx.repo.list('stock'),
    ctx.repo.list('location'),
    ctx.repo.list('furniture'),
    ctx.repo.list('outflow'),
    ctx.repo.thumbnailUrls(),
  ]);
  const rows = buildRows({ wines, stocks, locations, furniture });
  const now = new Date();
  const year = now.getFullYear();
  const total = overview(rows).bottles;
  return h(
    'main',
    { class: 'view home' },
    pageHeader({ title: 'Accueil', subtitle: total === 0 ? null : bottles(total) }),
    toDrinkSection(rows, thumbs, year),
    occasionSection(rows, year),
    statsSection(rows, outflows, year, now),
  );
}
