// Réglages : compte, état de la synchronisation, contenu local, accès aux listes et à l'historique.
import type { AppContext } from '../../app';
import { knownEmail, signOut, currentToken } from '../../auth/google-auth';
import { ENTITY_KINDS } from '../../domain/types';
import { Router } from '../router';
import { formatLastSync, statusMessage, describeStatus } from '../components/sync-status';
import { pageHeader } from '../components/page-header';
import { exportCard } from '../components/export-card';
import { versionCard } from '../components/version-card';
import { lockSettingsCard } from '../components/lock-settings';
import { h } from '../dom';
import { icon } from '../icons';
import { fr } from '../strings.fr';

const KIND_LABELS: Record<string, string> = {
  wine: 'Fiches de vin',
  furniture: 'Meubles',
  location: 'Emplacements',
  stock: 'Stocks',
  outflow: 'Sorties',
  photo: 'Miniatures',
  proposal: 'Propositions',
  person: 'Personnes',
};

export async function settingsView(ctx: AppContext): Promise<HTMLElement> {
  const counts = await Promise.all(
    ENTITY_KINDS.map(async (k) => [k, (await ctx.repo.list(k)).length] as const),
  );
  await ctx.scheduler.refresh();

  const row = (label: string, value: string): HTMLElement =>
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px' }, h('span', { class: 'muted' }, label), h('span', {}, value));

  // --- synchronisation : état en direct + synchronisation manuelle ---
  const stateLine = h('strong', {});
  const detail = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const lastLine = h('p', { class: 'muted' });
  const noticesLink = h('a', { class: 'btn btn--small', href: '#/avis' });
  const syncBtn = h('button', { class: 'btn btn--primary', type: 'button' }, fr.settings.syncNow);

  const paint = (): void => {
    const s = ctx.scheduler.status();
    stateLine.textContent = describeStatus(s).label;
    detail.textContent = statusMessage(s);
    lastLine.textContent = formatLastSync(s.lastSyncAt);
    noticesLink.textContent = s.notices > 0 ? `${s.notices} avis à lire` : '';
    noticesLink.toggleAttribute('hidden', s.notices === 0);
    syncBtn.toggleAttribute('disabled', s.state === 'syncing');
    syncBtn.textContent = s.state === 'syncing' ? fr.settings.syncing : fr.settings.syncNow;
  };
  paint();
  let seen = false;
  const unsubscribe = ctx.scheduler.subscribe(() => {
    if (!stateLine.isConnected && seen) return unsubscribe();
    if (stateLine.isConnected) seen = true;
    paint();
  });

  syncBtn.addEventListener('click', () => void ctx.scheduler.syncNow());

  return h(
    'main',
    { class: 'view' },
    pageHeader({ title: fr.settings.title }),
    h(
      'section',
      { class: 'card stack', 'aria-label': 'Synchronisation' },
      h('h2', {}, 'Synchronisation'),
      row(fr.settings.account, currentToken() ? (knownEmail() ?? 'connecté') : fr.settings.notConnected),
      h('div', {}, stateLine, detail, lastLine),
      noticesLink,
      syncBtn,
    ),
    lockSettingsCard(),
    exportCard(ctx),
    versionCard(),
    h(
      'section',
      { class: 'card', 'aria-label': fr.settings.contents },
      h('h2', {}, fr.settings.contents),
      ...counts.map(([k, n]) => row(KIND_LABELS[k] ?? k, String(n))),
    ),
    h(
      'a',
      { class: 'card card--link', href: '#/historique' },
      icon('list'),
      h('div', { class: 'grow' }, h('strong', {}, 'Historique des sorties'), h('div', { class: 'muted' }, 'Les bouteilles bues, offertes, cassées…')),
    ),
    h(
      'a',
      { class: 'card card--link', href: '#/personnes' },
      icon('list'),
      h('div', { class: 'grow' }, h('strong', {}, 'Personnes'), h('div', { class: 'muted' }, 'La liste des personnes qui vous offrent des bouteilles (champ « Cadeau »).')),
    ),
    h(
      'a',
      { class: 'card card--link', href: '#/mets' },
      icon('list'),
      h('div', { class: 'grow' }, h('strong', {}, 'Compléter les mets'), h('div', { class: 'muted' }, 'Ajouter les mets conseillés (végétariens) aux fiches qui n’en ont pas, avec Claude.')),
    ),
    h(
      'button',
      {
        class: 'btn',
        onClick: () => {
          signOut();
          Router.go('/connexion');
        },
      },
      fr.settings.signOut,
    ),
  );
}
