// Bouton « Ouvrir mon projet Claude » (ou, sans adresse, lien vers Réglages) + carte de réglage de l'adresse.
import { claudeProjectUrl, setClaudeProjectUrl } from '../claude-project';
import { h } from '../dom';
import { icon } from '../icons';

/** Ouvre le projet Claude dans un nouvel onglet ; sans adresse réglée, renvoie vers Réglages. */
export function claudeProjectButton(opts: { small?: boolean } = {}): HTMLElement {
  const url = claudeProjectUrl();
  const cls = `btn${opts.small ? ' btn--small' : ''}${url ? ' btn--primary' : ''}`;
  return url
    ? h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('add'), 'Ouvrir mon projet Claude')
    : h('a', { class: cls, href: '#/reglages' }, icon('tune'), 'Régler l’adresse du projet Claude');
}

export function claudeProjectCard(): HTMLElement {
  const input = h('input', { class: 'field__input', id: 'claude-url', type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://claude.ai/project/…', 'aria-label': 'Adresse du projet Claude' });
  input.value = claudeProjectUrl() ?? '';
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const save = h('button', { class: 'btn', type: 'button' }, 'Enregistrer');
  save.addEventListener('click', () => {
    const ok = setClaudeProjectUrl(input.value);
    status.textContent = ok ? (input.value.trim() === '' ? 'Adresse effacée.' : 'Adresse enregistrée sur cet appareil.') : 'Adresse invalide : elle doit commencer par https://';
  });
  return h(
    'section',
    { class: 'card stack', 'aria-label': 'Projet Claude' },
    h('h2', {}, 'Projet Claude'),
    h('p', { class: 'muted' }, 'L’adresse de votre projet Claude (lecture des étiquettes), pour l’ouvrir en un tap depuis « Ajouter ». Elle est mémorisée sur cet appareil seulement.'),
    h('label', { class: 'field', for: 'claude-url' }, h('span', { class: 'field__label' }, 'Adresse'), input),
    save,
    status,
  );
}
