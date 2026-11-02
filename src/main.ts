import './ui/styles/base.css';
import { createContext, initialHash, isSheetReady } from './app';
import { decorateWithSyncStatus } from './ui/components/sync-status';
import { Router, type Route } from './ui/router';
import { fr } from './ui/strings.fr';
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
  ];

  // Hors-ligne d'abord : si la feuille est déjà prête sur cet appareil, on ouvre la cave
  // directement (la reconnexion Google n'est nécessaire que pour synchroniser).
  const ready = await isSheetReady(ctx);
  if (!window.location.hash) window.location.hash = initialHash(ready);

  new Router(ctx, routes, ready ? '/cave' : '/connexion', ['/connexion'], (view) => decorateWithSyncStatus(view, ctx.scheduler)).mount(root);
}

void boot();
