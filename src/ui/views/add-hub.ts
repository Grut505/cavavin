// Onglet « Ajouter » : trois façons d'entrer une bouteille.
import type { AppContext } from '../../app';
import { pageHeader } from '../components/page-header';
import { openPasteDialog } from '../components/paste-dialog';
import { promptCopy } from '../components/prompt-copy';
import { h } from '../dom';
import { icon } from '../icons';
import { Router } from '../router';

export async function addHubView(ctx: AppContext): Promise<HTMLElement> {
  const pending = (await ctx.repo.pendingProposals()).length;

  const pasteCard = h(
    'button',
    {
      class: 'card card--link',
      type: 'button',
      style: 'width:100%;text-align:left;cursor:pointer',
      onClick: async () => {
        const ids = await openPasteDialog(ctx);
        if (!ids || ids.length === 0) return;
        Router.go(ids.length === 1 ? `/ajouter/saisie?proposal=${encodeURIComponent(ids[0]!)}` : '/propositions');
      },
    },
    icon('add'),
    h('div', { class: 'grow' }, h('strong', {}, 'Coller depuis Claude'), h('div', { class: 'muted' }, 'Collez le JSON donné par votre projet Claude.')),
  );

  return h(
    'main',
    { class: 'view' },
    pageHeader({ title: 'Ajouter' }),
    h('p', { class: 'muted' }, 'Faites lire l’étiquette par votre projet Claude, puis rangez la bouteille ici. Vous pouvez aussi tout saisir à la main.'),
    h(
      'a',
      { class: 'card card--link', href: '#/propositions' },
      icon('list'),
      h('div', { class: 'grow' }, h('strong', {}, 'Propositions à ranger'), h('div', { class: 'muted' }, 'Déposées par Claude dans la feuille ou collées.')),
      h('span', { class: 'badge', 'aria-label': `${pending} en attente` }, String(pending)),
    ),
    pasteCard,
    h('section', { class: 'card stack' }, h('strong', {}, 'Prompt pour Claude'), h('p', { class: 'muted' }, 'À donner à n’importe quelle conversation Claude avec la photo de l’étiquette.'), promptCopy()),
    h(
      'a',
      { class: 'card card--link', href: '#/ajouter/saisie' },
      icon('edit'),
      h('div', { class: 'grow' }, h('strong', {}, 'Saisie manuelle'), h('div', { class: 'muted' }, 'Remplir la fiche à la main, photo facultative.')),
    ),
  );
}
