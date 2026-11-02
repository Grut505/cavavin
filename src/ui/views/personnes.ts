// Réglages › Personnes : liste paramétrable des personnes qui offrent des bouteilles.
import type { AppContext } from '../../app';
import { PersonRuleError } from '../../domain/people';
import { confirmDialog, promptDialog } from '../components/dialog';
import { pageHeader } from '../components/page-header';
import { h } from '../dom';
import { icon } from '../icons';

export function personsView(ctx: AppContext): HTMLElement {
  const alertBox = h('div', { role: 'alert', 'aria-live': 'assertive' });
  const body = h('div', { class: 'stack' });

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    alertBox.replaceChildren();
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof PersonRuleError ? e.message : `Une erreur est survenue : ${e instanceof Error ? e.message : String(e)}`;
      alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, msg));
    }
    await refresh();
  };

  async function refresh(): Promise<void> {
    const persons = await ctx.repo.persons();
    const counts = new Map<string, number>();
    for (const p of persons) counts.set(p.id, await ctx.repo.giftCount(p.id));

    const nameInput = h('input', { class: 'field__input', type: 'text', placeholder: 'Ex. Marie', autocomplete: 'off', required: true });
    const form = h(
      'form',
      {
        class: 'card stack',
        onSubmit: (e: Event) => {
          e.preventDefault();
          void run(() => ctx.repo.addPerson(nameInput.value));
        },
      },
      h('h2', {}, 'Nouvelle personne'),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nom'), nameInput),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
    );

    const rows = persons.map((p) => {
      const n = counts.get(p.id) ?? 0;
      return h(
        'li',
        { class: 'list__item' },
        h('span', { class: 'grow' }, p.name),
        n > 0 ? h('span', { class: 'badge', 'aria-label': `${n} bouteille${n > 1 ? 's' : ''} offerte${n > 1 ? 's' : ''}` }, String(n)) : null,
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost',
            type: 'button',
            'aria-label': `Renommer ${p.name}`,
            onClick: async () => {
              const name = await promptDialog({ title: 'Renommer la personne', label: 'Nom', value: p.name, confirmLabel: 'Enregistrer' });
              if (name !== null) await run(() => ctx.repo.renamePerson(p.id, name));
            },
          },
          icon('edit'),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--ghost icon-btn--danger',
            type: 'button',
            'aria-label': `Supprimer ${p.name}`,
            onClick: async () => {
              const message =
                n > 0
                  ? `${n} bouteille${n > 1 ? 's sont marquées' : ' est marquée'} comme offerte${n > 1 ? 's' : ''} par ${p.name} : elle${n > 1 ? 's' : ''} resteront marquée${n > 1 ? 's' : ''} « cadeau », avec ce nom.`
                  : `${p.name} sera retiré(e) de la liste.`;
              const ok = await confirmDialog({ title: 'Supprimer cette personne ?', message, confirmLabel: 'Supprimer', danger: true });
              if (ok) await run(() => ctx.repo.removePerson(p.id));
            },
          },
          icon('trash'),
        ),
      );
    });

    body.replaceChildren(
      rows.length > 0
        ? h('section', { class: 'card' }, h('ul', { class: 'list' }, rows))
        : h('div', { class: 'card empty' }, h('h2', {}, 'Aucune personne'), h('p', { class: 'muted' }, 'Ajoutez ceux qui vous offrent des bouteilles : ils seront proposés dans le champ « Cadeau » d’une fiche.')),
      form,
    );
  }

  const root = h(
    'main',
    { class: 'view' },
    pageHeader({ title: 'Personnes', subtitle: 'Cadeaux : qui offre quoi', back: '#/reglages', backLabel: 'Retour aux réglages' }),
    alertBox,
    body,
  );
  void refresh();
  return root;
}
