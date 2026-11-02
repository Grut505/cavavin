import './ui/styles/base.css';
import { createContext, initialHash, isSheetReady } from './app';
import { requestToken, tryRenewSilently } from './auth/google-auth';
import { reconnectBanner } from './ui/components/reconnect-banner';
import { decorateWithSyncStatus } from './ui/components/sync-status';
import { Router, type Route } from './ui/router';
import { fr } from './ui/strings.fr';
import { accessDeniedView, purgeLocalData } from './ui/views/access-denied';
import { addHubView } from './ui/views/add-hub';
import { addWineView, editWineView } from './ui/views/add-wine';
import { caveConfigView } from './ui/views/cave-config';
import { caveView } from './ui/views/cave';
import { historyView } from './ui/views/history';
import { personsView } from './ui/views/personnes';
import { proposalsView } from './ui/views/proposals';
import { settingsView } from './ui/views/settings';
import { wineDetailView } from './ui/views/wine-detail';
import { wineListView } from './ui/views/wine-list';
import { shelfDetailView } from './ui/views/shelf-detail';
import { signInView } from './ui/views/sign-in';
import { syncNoticesView } from './ui/views/sync-notices';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const ctx = await createContext();
  // La synchronisation tourne en arrière-plan : à l'ouverture, après chaque écriture, au retour du réseau.
  ctx.scheduler.start();
  // Jeton expiré mais compte connu : renouvellement silencieux (sans bloquer l'ouverture).
  void tryRenewSilently();

  const routes: Route[] = [
    { path: '/cave', nav: { label: fr.nav.cave, icon: 'cave' }, render: caveView },
    { path: '/cave/config', parent: '/cave', render: caveConfigView },
    { path: '/etagere/:id', parent: '/cave', render: shelfDetailView },
    { path: '/liste', nav: { label: fr.nav.list, icon: 'list' }, render: wineListView },
    { path: '/vin/:id', parent: '/liste', render: wineDetailView },
    { path: '/vin/:id/modifier', parent: '/liste', render: editWineView },
    { path: '/historique', parent: '/reglages', render: historyView },
    { path: '/ajouter', nav: { label: fr.nav.add, icon: 'add' }, render: addHubView },
    { path: '/ajouter/saisie', parent: '/ajouter', render: addWineView },
    { path: '/propositions', parent: '/ajouter', render: proposalsView },
    { path: '/reglages', nav: { label: fr.nav.settings, icon: 'settings' }, render: settingsView },
    { path: '/personnes', parent: '/reglages', render: personsView },
    { path: '/avis', parent: '/reglages', render: syncNoticesView },
    { path: '/connexion', render: signInView },
    { path: '/refuse', render: accessDeniedView },
  ];

  // Hors-ligne d'abord : si la feuille est déjà prête sur cet appareil, on ouvre la cave
  // directement (la reconnexion Google n'est nécessaire que pour synchroniser).
  const ready = await isSheetReady(ctx);
  if (!window.location.hash) window.location.hash = initialHash(ready);

  // Accès refusé par Google : on n'affiche plus aucune donnée. Le cache est purgé s'il n'y a rien à
  // perdre ; sinon (modifications non envoyées) il est conservé, masqué, jusqu'au changement de compte.
  let deniedHandled = false;
  ctx.scheduler.subscribe(() => {
    if (ctx.scheduler.status().state !== 'denied' || deniedHandled) return;
    deniedHandled = true;
    void (async () => {
      if ((await ctx.repo.pendingCount()) === 0) await purgeLocalData(ctx);
      window.location.hash = '#/refuse';
    })();
  });

  const decorate = (view: HTMLElement): void => {
    decorateWithSyncStatus(view, ctx.scheduler);
    const header = view.querySelector('.app-header');
    if (header) header.after(reconnectBanner(ctx.scheduler, { signIn: () => requestToken(true) }));
  };

  new Router(ctx, routes, ready ? '/cave' : '/connexion', ['/connexion', '/refuse'], decorate).mount(root);
}

void boot();
