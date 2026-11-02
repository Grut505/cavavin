// Carte « Verrou de l'application » des Réglages : activer / désactiver Face ID.
import { disableLock, enableLock, isLockEnabled, isLockSupported, type PasskeyApi, browserPasskeyApi } from '../../auth/app-lock';
import { h } from '../dom';

export function lockSettingsCard(api: PasskeyApi | null = browserPasskeyApi()): HTMLElement {
  const root = h('section', { class: 'card stack', 'aria-label': 'Verrou de l’application' });
  const draw = async (error = ''): Promise<void> => {
    const supported = await isLockSupported(api);
    const enabled = isLockEnabled();
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
        : h('p', { class: 'muted' }, 'Non disponible ici : Face ID, Touch ID ou un code d’appareil est nécessaire (sur iPhone, ajoutez l’app à l’écran d’accueil).'),
      supported || enabled ? toggle : null,
      error ? h('p', { class: 'alert alert--error', role: 'alert' }, error) : null,
    ];
    root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  };
  void draw();
  return root;
}
