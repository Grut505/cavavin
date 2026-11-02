// Propositions du projet Claude en attente : ranger (valider dans le formulaire) ou écarter.
import type { AppContext } from '../../app';
import type { Proposal } from '../../domain/types';
import { pageHeader } from '../components/page-header';
import { confirmDialog } from '../components/dialog';
import { openPasteDialog } from '../components/paste-dialog';
import { h } from '../dom';
import { Router } from '../router';

export const SOURCE_LABELS: Record<string, string> = { claude: 'Projet Claude', paste: 'Collée' };

function summary(p: Proposal): string {
  return [p.cuvee, p.vintage ?? (p.domain || p.cuvee ? 'NV' : null)].filter((x) => x !== null && x !== '').join(' · ');
}

function details(p: Proposal): string {
  return [p.appellation, p.region, p.color, p.quantity ? `×${p.quantity}` : null].filter(Boolean).join(' · ');
}

export async function proposalsView(ctx: AppContext): Promise<HTMLElement> {
  const list = h('div', { class: 'stack' });

  const draw = async (): Promise<void> => {
    const proposals = await ctx.repo.pendingProposals();
    if (proposals.length === 0) {
      list.replaceChildren(
        h(
          'div',
          { class: 'card empty' },
          h('h2', {}, 'Aucune proposition en attente'),
          h('p', { class: 'muted' }, 'Faites lire une étiquette par votre projet Claude : sa proposition apparaîtra ici, ou collez-la depuis l’écran Ajouter.'),
        ),
      );
      return;
    }
    list.replaceChildren(
      ...proposals.map((p) =>
        h(
          'article',
          { class: 'card stack' },
          h(
            'div',
            { class: 'row row--between' },
            h('strong', {}, p.domain || p.cuvee || p.appellation || 'Sans nom'),
            h('span', { class: 'badge' }, SOURCE_LABELS[p.source] ?? p.source),
          ),
          summary(p) ? h('div', {}, summary(p)) : null,
          details(p) ? h('div', { class: 'muted' }, details(p)) : null,
          h(
            'div',
            { class: 'row' },
            h('a', { class: 'btn btn--primary grow', href: `#/ajouter/saisie?proposal=${encodeURIComponent(p.id)}` }, 'Ranger'),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                'aria-label': `Écarter la proposition ${p.domain ?? ''}`,
                onClick: async () => {
                  const ok = await confirmDialog({ title: 'Écarter cette proposition ?', message: 'Elle ne sera pas ajoutée à la cave.', confirmLabel: 'Écarter', danger: true });
                  if (ok) {
                    await ctx.repo.resolveProposal(p.id, 'écartée');
                    await draw();
                  }
                },
              },
              'Écarter',
            ),
          ),
        ),
      ),
    );
  };

  await draw();
  return h(
    'main',
    { class: 'view' },
    pageHeader({
      title: 'Propositions',
      back: '#/ajouter',
      actions: [
        h(
          'button',
          {
            class: 'btn btn--small',
            type: 'button',
            onClick: async () => {
              const ids = await openPasteDialog(ctx);
              if (ids && ids.length > 0) {
                if (ids.length === 1) Router.go(`/ajouter/saisie?proposal=${encodeURIComponent(ids[0]!)}`);
                else await draw();
              }
            },
          },
          'Coller',
        ),
      ],
    }),
    list,
  );
}
