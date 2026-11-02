// Carte « Verrou de l'application » des Réglages : activer / désactiver Face ID.
import { disableLock, enableLock, isLockEnabled, isLockSupported, lockDiagnostic, type PasskeyApi, browserPasskeyApi } from '../../auth/app-lock';
import { h } from '../dom';

export function lockSettingsCard(api: PasskeyApi | null = browserPasskeyApi()): HTMLElement {
  const root = h('section', { class: 'card stack', 'aria-label': 'Verrou de l’application' });
  const draw = async (error = ''): Promise<void> => {
    const supported = await isLockSupported(api);
    const enabled = isLockEnabled();
    const diag = await lockDiagnostic(api);
    const deviceReady = !diag.includes('non détecté');
    const toggle = h('button', { class: 'btn', type: 'button' }, enabled ? 'Désactiver le verrou' : 'Activer le verrou Face ID');
    toggle.addEventListener('click', () => {
      toggle.setAttribute('disabled', '');
      if (enabled) {
        disableLock();
        void draw();
        return;
      }
      enableLock(api).then(
        () => draw(),
        (e: unknown) => draw(e instanceof Error ? e.message : 'Activation impossible.'),
      );
    });
    const parts: (HTMLElement | null)[] = [
      h('h2', {}, 'Verrou de l’application'),
      supported || enabled
        ? h(
            'p',
            { class: 'muted' },
            enabled
              ? 'Verrou actif : Face ID (ou le code du téléphone) est demandé à l’ouverture et après 1 minute en arrière-plan.'
              : 'Demande Face ID (ou le code du téléphone) à l’ouverture et après 1 minute en arrière-plan. Ce verrou écarte quelqu’un qui prend votre téléphone déverrouillé.',
          )
        : h('p', { class: 'muted' }, 'Non disponible ici : ce navigateur ne propose pas Face ID aux sites web. Essayez dans Safari (iOS 16 ou plus).'),
      !enabled && supported && !deviceReady
        ? h('p', { class: 'muted' }, 'Face ID n’est pas détecté (est-il configuré, avec un code, dans les réglages de l’iPhone ?). Vous pouvez essayer quand même.')
        : null,
      supported || enabled ? toggle : null,
      error ? h('p', { class: 'alert alert--error', role: 'alert' }, error) : null,
      h('p', { class: 'muted', style: 'font-size:0.75rem' }, diag),
    ];
    root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  };
  void draw();
  return root;
}
