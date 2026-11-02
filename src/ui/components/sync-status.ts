// Indicateur d'état de synchronisation (FR-015) : à jour / en attente (n) / hors-ligne… + dernière synchro.
import type { SyncScheduler, SyncStatus } from '../../data/sync-scheduler';
import { h } from '../dom';

export type Tone = 'ok' | 'busy' | 'warn' | 'bad';

export interface StatusView {
  label: string;
  tone: Tone;
}

export function describeStatus(s: SyncStatus): StatusView {
  switch (s.state) {
    case 'synced':
      return { label: 'À jour', tone: 'ok' };
    case 'pending':
      return { label: `${s.pending} en attente`, tone: 'warn' };
    case 'syncing':
      return { label: 'Synchro…', tone: 'busy' };
    case 'offline':
      return { label: s.pending > 0 ? `Hors-ligne · ${s.pending} en attente` : 'Hors-ligne', tone: 'warn' };
    case 'auth':
      return { label: s.pending > 0 ? `Non connecté · ${s.pending} en attente` : 'Non connecté', tone: 'bad' };
    case 'denied':
      return { label: 'Accès refusé', tone: 'bad' };
    case 'error':
      return { label: 'Erreur', tone: 'bad' };
  }
}

/** Explication complète, pour l'info-bulle et l'écran Réglages. */
export function statusMessage(s: SyncStatus): string {
  switch (s.state) {
    case 'synced':
      return 'Tout est à jour.';
    case 'pending':
      return `${s.pending} modification${s.pending > 1 ? 's' : ''} en attente d’envoi.`;
    case 'syncing':
      return 'Synchronisation en cours…';
    case 'offline':
      return `Pas de réseau : l’application reste utilisable${s.pending > 0 ? `, ${s.pending} modification${s.pending > 1 ? 's seront envoyées' : ' sera envoyée'} au retour de la connexion` : ''}.`;
    case 'auth':
      return 'Session Google absente ou expirée : reconnectez-vous pour synchroniser. Vos modifications sont conservées.';
    case 'denied':
      return 'Ce compte Google n’a pas accès à la feuille de la cave.';
    case 'error':
      return s.message ?? 'La synchronisation a échoué. Nouvelle tentative automatique.';
  }
}

export function formatLastSync(iso: string | null): string {
  if (!iso) return 'Jamais synchronisé';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Jamais synchronisé' : `Dernière synchronisation : ${d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
}

/** Pastille(s) d'état : s'actualise toute seule tant qu'elle est affichée. */
export function syncStatusChip(scheduler: Pick<SyncScheduler, 'status' | 'subscribe'>): HTMLElement {
  const root = h('span', { class: 'sync-chips' });
  let seen = false;

  const update = (): void => {
    if (root.isConnected) seen = true;
    else if (seen) return unsubscribe();
    const s = scheduler.status();
    const { label, tone } = describeStatus(s);
    const title = `${statusMessage(s)} ${formatLastSync(s.lastSyncAt)}.`;
    const chips: HTMLElement[] = [
      h(
        'a',
        { class: `sync-chip sync-chip--${tone}`, href: '#/reglages', role: 'status', 'aria-live': 'polite', title, 'aria-label': `${label}. ${title}`, 'data-state': s.state },
        h('span', { class: 'sync-chip__dot', 'aria-hidden': 'true' }),
        h('span', { class: 'sync-chip__text' }, label),
      ),
    ];
    if (s.notices > 0) {
      chips.push(
        h(
          'a',
          { class: 'sync-chip sync-chip--warn', href: '#/avis', 'aria-label': `${s.notices} avis de synchronisation à lire`, 'data-notices': String(s.notices) },
          h('span', { class: 'sync-chip__text' }, `${s.notices} avis`),
        ),
      );
    }
    root.replaceChildren(...chips);
  };

  const unsubscribe = scheduler.subscribe(update);
  update();
  return root;
}

/** Ajoute l'indicateur à l'en-tête fixe d'un écran (s'il en a un). */
export function decorateWithSyncStatus(view: HTMLElement, scheduler: Pick<SyncScheduler, 'status' | 'subscribe'>): void {
  const header = view.querySelector('.app-header');
  if (!header) return;
  let actions = header.querySelector('.app-header__actions');
  if (!actions) {
    actions = h('div', { class: 'app-header__actions' });
    header.append(actions);
  }
  actions.prepend(syncStatusChip(scheduler));
}
