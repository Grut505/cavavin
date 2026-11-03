// Bandeau du formulaire ouvert par un lien de Claude : origine des données, avertissements, et — dans un onglet de
// navigateur sans cave (typiquement Safari sur iPhone, dont les données sont séparées de l'appli installée) — deux
// sorties : copier la fiche pour la coller dans l'appli installée, ou l'envoyer à la cave via Google.
import type { AppContext } from '../../app';
import { requestToken } from '../../auth/google-auth';
import type { ProposalData } from '../../scan/proposal';
import { h } from '../dom';

export function prefillBanner(
  ctx: AppContext,
  opts: { data: ProposalData | null; warnings: string[]; error?: string; offerHandoff: boolean },
): HTMLElement {
  if (!opts.data) {
    return h('p', { class: 'alert alert--error', role: 'alert' }, opts.error ?? 'Lien illisible : le formulaire est vide.');
  }
  const data = opts.data;
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const box = h(
    'div',
    { class: 'alert stack', 'data-prefill': 'true' },
    h('p', {}, 'Pré-rempli à partir du lien de Claude : vérifiez, corrigez si besoin, puis enregistrez.'),
    opts.warnings.length > 0 ? h('ul', {}, opts.warnings.map((w) => h('li', {}, w))) : null,
  );
  if (opts.offerHandoff) {
    const copy = h(
      'button',
      {
        class: 'btn btn--small',
        type: 'button',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(data.raw_json);
            status.textContent = 'Copié. Ouvrez l’appli installée, Ajouter, « Coller la réponse de Claude », puis collez.';
          } catch {
            status.textContent = 'Copie impossible depuis ce navigateur.';
          }
        },
      },
      'Copier pour l’appli installée',
    );
    const send = h(
      'button',
      {
        class: 'btn btn--small btn--primary',
        type: 'button',
        onClick: async () => {
          send.setAttribute('disabled', '');
          try {
            status.textContent = 'Connexion à Google…';
            await requestToken(true);
            await ctx.repo.createProposal(data, 'lien');
            await ctx.scheduler.syncNow();
            status.textContent = 'Envoyé à votre cave : ouvrez l’appli installée, la fiche vous attend dans « Propositions ».';
          } catch (e) {
            status.textContent = `Envoi impossible : ${e instanceof Error ? e.message : String(e)}`;
            send.removeAttribute('disabled');
          }
        },
      },
      'Envoyer à ma cave',
    );
    box.append(
      h('p', { class: 'muted' }, 'Vous êtes dans le navigateur : l’appli installée a ses propres données.'),
      h('div', { class: 'row row--wrap' }, send, copy),
    );
  }
  box.append(status);
  return box;
}
