// « Coller depuis Claude » : lit le JSON produit par le projet Claude et crée des propositions.
import type { AppContext } from '../../app';
import { RETRY_PROMPT } from '../../scan/prompt';
import { ProposalParseError, parseProposals } from '../../scan/proposal';
import { h } from '../dom';
import { openDialog } from './dialog';
import { promptCopy } from './prompt-copy';

/** Retourne les identifiants des propositions créées, ou `null` si annulé. */
export function openPasteDialog(ctx: Pick<AppContext, 'repo'>): Promise<string[] | null> {
  const { result } = openDialog<string[]>('Coller depuis Claude', (close) => {
    const area = h('textarea', {
      class: 'field__input',
      rows: '8',
      placeholder: 'Collez ici le JSON donné par votre projet Claude…',
      'aria-label': 'JSON de la proposition',
      style: 'min-height:160px;padding:12px;font-family:ui-monospace,monospace;font-size:0.85rem',
    });
    const message = h('div', { role: 'status', 'aria-live': 'polite' });
    const actions = h('div', { class: 'dialog__actions' });
    const show = (cls: string, text: string): void => message.replaceChildren(h('p', { class: `alert ${cls}` }, text));

    const readClipboard = async (): Promise<void> => {
      try {
        area.value = await navigator.clipboard.readText();
        message.replaceChildren();
      } catch {
        show('', 'Lecture du presse-papiers impossible : collez le texte à la main dans le champ.');
      }
    };

    const importNow = async (): Promise<void> => {
      let parsed;
      try {
        parsed = parseProposals(area.value);
      } catch (e) {
        if (e instanceof ProposalParseError && e.code === 'no_json') {
          const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
          message.replaceChildren(
            h('p', { class: 'alert alert--error' }, 'Cette réponse ne contient pas de JSON : Claude a répondu en texte libre. Renvoyez-lui la consigne de relance, puis collez sa nouvelle réponse.'),
            h(
              'button',
              {
                class: 'btn btn--small',
                type: 'button',
                onClick: async () => {
                  try {
                    await navigator.clipboard.writeText(RETRY_PROMPT);
                    status.textContent = 'Consigne de relance copiée : collez-la dans la conversation avec Claude.';
                  } catch {
                    status.textContent = RETRY_PROMPT;
                  }
                },
              },
              'Copier la consigne de relance',
            ),
            status,
          );
          return;
        }
        show('alert--error', e instanceof ProposalParseError ? e.message : 'Texte illisible.');
        return;
      }
      const ids: string[] = [];
      for (const p of parsed.proposals) ids.push((await ctx.repo.createProposal(p, 'paste')).id);
      if (parsed.warnings.length === 0) return close(ids);
      area.setAttribute('disabled', '');
      message.replaceChildren(
        h('p', { class: 'alert' }, `${ids.length} proposition(s) importée(s), avec des avertissements :`),
        h('ul', {}, parsed.warnings.map((w) => h('li', {}, w))),
      );
      actions.replaceChildren(h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close(ids) }, 'Continuer'));
    };

    actions.append(
      h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler'),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void importNow() }, 'Importer'),
    );
    return [
      h('p', { class: 'muted' }, '1. Donnez le prompt à Claude avec la photo. 2. Collez sa réponse ci-dessous.'),
      promptCopy(),
      h('button', { class: 'btn btn--small', type: 'button', onClick: () => void readClipboard() }, 'Lire le presse-papiers'),
      area,
      message,
      actions,
    ];
  });
  return result;
}
