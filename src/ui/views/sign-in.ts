// Écran de connexion Google + initialisation de la feuille (premier lancement).
import type { AppContext } from '../../app';
import { markSheetReady } from '../../app';
import { AuthError, knownEmail, requestToken, signOut } from '../../auth/google-auth';
import { SchemaTooNewError, TabNameConflictError, initSheet, isInitialized } from '../../data/init-sheet';
import { SheetsError } from '../../data/sheets-api';
import { Router } from '../router';
import { h } from '../dom';
import { fr } from '../strings.fr';

type State =
  | { step: 'idle'; message?: string }
  | { step: 'busy'; label: string }
  | { step: 'init' }
  | { step: 'denied'; email?: string; detail?: string }
  | { step: 'error'; message: string };

export function describeError(e: unknown): string {
  if (e instanceof AuthError) {
    if (e.code === 'popup_blocked') return fr.signIn.popupBlocked;
    if (e.code === 'denied') return fr.signIn.cancelled;
    if (e.code === 'expired') return fr.signIn.expired;
    return e.message;
  }
  if (e instanceof SheetsError) {
    if (e.kind === 'network') return fr.signIn.offline;
    if (e.kind === 'api_disabled') return fr.signIn.apiDisabled;
    if (e.kind === 'scope') return fr.signIn.scope;
    if (e.kind === 'auth') return fr.signIn.expired;
    return `${fr.signIn.unexpected} (${e.status ?? e.kind}) : ${e.message}`;
  }
  if (e instanceof TabNameConflictError || e instanceof SchemaTooNewError) return e.message;
  return `${fr.signIn.unexpected} : ${e instanceof Error ? e.message : String(e)}`;
}

export function signInView(ctx: AppContext): HTMLElement {
  const root = h('main', { class: 'view view--centered' });
  let state: State = { step: 'idle' };

  const finish = async (): Promise<void> => {
    await ctx.repo.sync();
    await markSheetReady(ctx);
    Router.go('/accueil');
  };

  const checkAccessAndContinue = async (): Promise<void> => {
    set({ step: 'busy', label: fr.signIn.checking });
    try {
      const tabs = await ctx.api.listTabs();
      if (isInitialized(tabs)) {
        set({ step: 'busy', label: fr.signIn.syncing });
        await finish();
      } else {
        set({ step: 'init' });
      }
    } catch (e) {
      if (e instanceof SheetsError && e.kind === 'forbidden') {
        const email = knownEmail();
        signOut();
        set({ step: 'denied', email, detail: e.message });
      } else {
        set({ step: 'error', message: describeError(e) });
      }
    }
  };

  const signIn = async (): Promise<void> => {
    set({ step: 'busy', label: fr.signIn.connecting });
    try {
      await requestToken(true);
    } catch (e) {
      if (e instanceof AuthError && e.code === 'not_allowed') {
        set({ step: 'denied', email: e.email, detail: 'Ce compte ne figure pas dans la liste des comptes autorisés de l’application.' });
        return;
      }
      set({ step: 'idle', message: describeError(e) });
      return;
    }
    await checkAccessAndContinue();
  };

  const initialize = async (): Promise<void> => {
    set({ step: 'busy', label: fr.signIn.initializing });
    try {
      await initSheet(ctx.api);
      set({ step: 'busy', label: fr.signIn.syncing });
      await finish();
    } catch (e) {
      set({ step: 'error', message: describeError(e) });
    }
  };

  function set(next: State): void {
    state = next;
    draw();
  }

  function draw(): void {
    const body: (HTMLElement | null)[] = [
      h('h1', {}, fr.signIn.title),
      h('p', { class: 'muted' }, fr.signIn.tagline),
    ];
    switch (state.step) {
      case 'idle':
        if (state.message) body.push(h('p', { class: 'alert alert--error', role: 'alert' }, state.message));
        body.push(h('button', { class: 'btn btn--primary', onClick: () => void signIn() }, fr.signIn.button));
        break;
      case 'busy':
        body.push(h('div', { class: 'spinner', role: 'status', 'aria-label': state.label }));
        body.push(h('p', { class: 'muted' }, state.label));
        break;
      case 'init':
        body.push(h('h2', {}, fr.signIn.initTitle));
        body.push(h('p', { class: 'muted' }, fr.signIn.initExplain));
        body.push(h('button', { class: 'btn btn--primary', onClick: () => void initialize() }, fr.signIn.initButton));
        break;
      case 'denied':
        body.push(h('p', { class: 'alert alert--error', role: 'alert' }, fr.signIn.denied));
        if (state.email) body.push(h('p', { class: 'muted' }, `${fr.signIn.deniedAccount} ${state.email}`));
        if (state.detail) body.push(h('p', { class: 'muted' }, `${fr.signIn.deniedDetail} ${state.detail}`));
        body.push(h('button', { class: 'btn', onClick: () => void signIn() }, fr.signIn.button));
        break;
      case 'error':
        body.push(h('p', { class: 'alert alert--error', role: 'alert' }, state.message));
        body.push(h('button', { class: 'btn', onClick: () => void signIn() }, fr.signIn.reconnect));
        break;
    }
    root.replaceChildren(...body.filter((b): b is HTMLElement => b !== null));
  }

  draw();
  return root;
}
