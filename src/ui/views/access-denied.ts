// Accès refusé : le compte connecté n'a pas accès à la feuille. Aucune donnée locale n'est affichée.
import type { AppContext } from '../../app';
import { knownEmail, signOut } from '../../auth/google-auth';
import { h } from '../dom';
import { Router } from '../router';
import { fr } from '../strings.fr';

/** Efface le cache local et la session (changement de compte, accès refusé). */
export async function purgeLocalData(ctx: Pick<AppContext, 'db'>): Promise<void> {
  await ctx.db.clearAll();
  signOut();
}

export async function accessDeniedView(ctx: AppContext): Promise<HTMLElement> {
  const pending = await ctx.repo.pendingCount();
  const email = knownEmail();
  const leave = async (): Promise<void> => {
    await purgeLocalData(ctx);
    Router.go('/connexion');
  };

  return h(
    'main',
    { class: 'view view--centered' },
    h('h1', {}, fr.signIn.title),
    h('p', { class: 'alert alert--error', role: 'alert' }, fr.signIn.denied),
    email ? h('p', { class: 'muted' }, `${fr.signIn.deniedAccount} ${email}`) : null,
    pending > 0
      ? h(
          'p',
          { class: 'muted' },
          `${pending} modification${pending > 1 ? 's' : ''} non envoyée${pending > 1 ? 's' : ''} ${pending > 1 ? 'sont' : 'est'} conservée${pending > 1 ? 's' : ''} sur cet appareil et masquée${pending > 1 ? 's' : ''}. Changer de compte les effacera.`,
        )
      : null,
    h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void leave() }, 'Changer de compte'),
  );
}
