import './ui/styles/base.css';
import { registerSW } from 'virtual:pwa-register';
import { startUpdates } from './app-update';
import { updateBanner } from './ui/components/update-banner';
import { createContext, initialHash, isSheetReady } from './app';
import { urgentBottles } from './domain/maturity';
import { buildRows } from './domain/query';
import { enforceAllowlist, requestToken, tryRenewSilently } from './auth/google-auth';
import { disableLock } from './auth/app-lock';
import { installLock } from './ui/components/lock-screen';
import { confirmDialog } from './ui/components/dialog';
import { reconnectBanner } from './ui/components/reconnect-banner';
import { decorateWithSyncStatus } from './ui/components/sync-status';
import { Router, type Route } from './ui/router';
import { fr } from './ui/strings.fr';
import { accessDeniedView, purgeLocalData } from './ui/views/access-denied';
import { homeView } from './ui/views/home';
import { pairingsBackfillView } from './ui/views/pairings-backfill';
import { shoppingView } from './ui/views/shopping';
import { inventoryView } from './ui/views/inventory';
import { personView } from './ui/views/person';
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
  // Compte connu mais absent de la liste d'adresses autorisées : session fermée, cave masquée.
  const accountAllowed = enforceAllowlist();
  if (!accountAllowed) {
    if ((await ctx.repo.pendingCount()) === 0) await purgeLocalData(ctx);
    window.location.hash = '#/refuse';
  }
  ctx.scheduler.start();
  // Jeton expiré mais compte connu : renouvellement silencieux (sans bloquer l'ouverture).
  void tryRenewSilently();

  // Mises à jour de l'application installée : application auto juste après l'ouverture, sinon bandeau.
  startUpdates(registerSW);
  document.body.append(updateBanner());

  const routes: Route[] = [
    { path: '/accueil', nav: { label: fr.nav.home, icon: 'home' }, render: homeView },
    { path: '/courses', parent: '/accueil', render: shoppingView },
    { path: '/cave', nav: { label: fr.nav.cave, icon: 'cave' }, render: caveView },
    { path: '/cave/config', parent: '/cave', render: caveConfigView },
    { path: '/etagere/:id', parent: '/cave', render: shelfDetailView },
    { path: '/pointage/:id', parent: '/cave', render: inventoryView },
    { path: '/liste', nav: { label: fr.nav.list, icon: 'list' }, render: wineListView },
    { path: '/vin/:id', parent: '/liste', followsOrigin: true, render: wineDetailView },
    { path: '/vin/:id/modifier', parent: '/liste', followsOrigin: true, render: editWineView },
    { path: '/historique', parent: '/reglages', render: historyView },
    { path: '/ajouter', nav: { label: fr.nav.add, icon: 'add' }, render: addHubView },
    { path: '/ajouter/saisie', parent: '/ajouter', render: addWineView },
    { path: '/propositions', parent: '/ajouter', render: proposalsView },
    { path: '/reglages', nav: { label: fr.nav.settings, icon: 'settings' }, render: settingsView },
    { path: '/personnes', parent: '/reglages', render: personsView },
    { path: '/mets', parent: '/reglages', render: pairingsBackfillView },
    { path: '/personne/:id', parent: '/reglages', render: personView },
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

  // Verrou Face ID (facultatif) : écran de verrouillage à l'ouverture et après un séjour en arrière-plan.
  installLock({
    onForgot: async () => {
      const ok = await confirmDialog({
        title: 'Déverrouillage impossible ?',
        message: 'Les données de cet appareil seront effacées et le verrou désactivé. Votre cave reste dans la feuille Google : reconnectez-vous pour la retrouver. Les modifications non synchronisées seront perdues.',
        confirmLabel: 'Effacer et me reconnecter',
        danger: true,
      });
      if (!ok) throw new Error('annulé');
      await purgeLocalData(ctx);
      disableLock();
      window.location.hash = '#/connexion';
    },
  });

  const router = new Router(ctx, routes, ready ? '/accueil' : '/connexion', ['/connexion', '/refuse'], decorate);
  router.mount(root);

  // Pastille sur l'onglet Accueil : bouteilles à boire en priorité (en retard ou à finir). Recalculée à chaque
  // écriture, après chaque synchronisation et au retour au premier plan (l'année peut avoir changé).
  const refreshBadge = async (): Promise<void> => {
    const [wines, stocks, locations, furniture] = await Promise.all([ctx.repo.list('wine'), ctx.repo.list('stock'), ctx.repo.list('location'), ctx.repo.list('furniture')]);
    const n = urgentBottles(buildRows({ wines, stocks, locations, furniture }), new Date().getFullYear());
    router.setBadge('/accueil', n, `${n} bouteille${n > 1 ? 's' : ''} à boire en priorité`);
  };
  ctx.repo.onWrite(() => void refreshBadge());
  ctx.scheduler.subscribe(() => void refreshBadge());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshBadge();
  });
  void refreshBadge();
}

void boot();
