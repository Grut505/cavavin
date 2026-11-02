// Compléter les mets des fiches existantes : prompt par lots à donner au projet Claude, puis collage de sa réponse.
import type { AppContext } from '../../app';
import { BACKFILL_BATCH, buildBackfillPrompt, parseBackfill, winesWithoutPairings } from '../../domain/pairing-backfill';
import { buildRows } from '../../domain/query';
import { pageHeader } from '../components/page-header';
import { h } from '../dom';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

export async function pairingsBackfillView(ctx: AppContext): Promise<HTMLElement> {
  const root = h('main', { class: 'view' });

  async function draw(feedback?: HTMLElement | null): Promise<void> {
    const [wines, stocks, locations, furniture] = await Promise.all([
      ctx.repo.list('wine'),
      ctx.repo.list('stock'),
      ctx.repo.list('location'),
      ctx.repo.list('furniture'),
    ]);
    const rows = buildRows({ wines, stocks, locations, furniture });
    const todo = winesWithoutPairings(rows);
    const prompt = buildBackfillPrompt(rows);

    const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const promptArea = h('textarea', { class: 'field__input', readonly: true, rows: '8', 'aria-label': 'Prompt pour Claude', style: 'font-size:0.8rem;font-family:ui-monospace,monospace' });
    promptArea.value = prompt.text;
    const details = h('details', {}, h('summary', { style: 'min-height:44px;display:flex;align-items:center;cursor:pointer' }, 'Voir le prompt'), promptArea);
    const copy = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(prompt.text);
        status.textContent = 'Prompt copié. Collez-le dans votre projet Claude, puis collez ici sa réponse.';
      } catch {
        details.setAttribute('open', '');
        promptArea.focus();
        promptArea.select();
        status.textContent = 'Copie automatique impossible : le texte est sélectionné, copiez-le à la main.';
      }
    };

    const answer = h('textarea', { class: 'field__input', id: 'backfill-answer', rows: '6', placeholder: 'Collez ici la réponse JSON de Claude…', style: 'font-family:ui-monospace,monospace;font-size:0.85rem' });
    const result = h('div', { role: 'status', 'aria-live': 'polite' });
    const apply = async (): Promise<void> => {
      const r = parseBackfill(answer.value, rows);
      if (r.updates.length === 0) {
        result.replaceChildren(
          h('p', { class: 'alert alert--error', role: 'alert' }, r.warnings[0] ?? 'Aucun met exploitable dans la réponse.'),
          ...r.warnings.slice(1).map((w) => h('p', { class: 'muted' }, w)),
        );
        return;
      }
      for (const u of r.updates) await ctx.repo.patch('wine', u.id, { pairings: u.pairings });
      await draw(
        h(
          'div',
          { class: 'card stack', role: 'status' },
          h('strong', {}, `${plural(r.updates.length, 'fiche complétée', 'fiches complétées')}.`),
          ...r.warnings.map((w) => h('p', { class: 'muted' }, w)),
        ),
      );
    };

    const body: (HTMLElement | null)[] = [
      pageHeader({ title: 'Compléter les mets', subtitle: todo.length === 0 ? 'Toutes les fiches ont des mets' : plural(todo.length, 'fiche sans mets', 'fiches sans mets'), back: '#/reglages', backLabel: 'Retour aux réglages' }),
      feedback ?? null,
    ];
    if (todo.length === 0) {
      body.push(h('div', { class: 'card empty muted' }, 'Rien à compléter : toutes vos fiches ont des mets conseillés.'));
    } else {
      body.push(
        h(
          'section',
          { class: 'card stack' },
          h('h2', {}, `1. Demander à Claude (${plural(prompt.count, 'fiche', 'fiches')})`),
          h('p', { class: 'muted' }, `Les mets sont végétariens et estimés par Claude, par lots de ${BACKFILL_BATCH} fiches maximum${prompt.remaining > 0 ? ` (il en restera ${prompt.remaining} pour le lot suivant)` : ''}.`),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void copy() }, 'Copier le prompt pour Claude'),
          status,
          details,
        ),
        h(
          'section',
          { class: 'card stack' },
          h('h2', {}, '2. Coller sa réponse'),
          h('label', { class: 'field', for: 'backfill-answer' }, h('span', { class: 'field__label' }, 'Réponse de Claude'), answer),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void apply() }, 'Appliquer aux fiches'),
          result,
          h('p', { class: 'muted' }, 'Seules les fiches sans mets sont modifiées ; rien n’est écrasé.'),
        ),
      );
    }
    root.replaceChildren(...body.filter((b): b is HTMLElement => b !== null));
  }

  await draw();
  return root;
}
