// Pictogrammes SVG inline (constantes statiques, trait hérité de `currentColor`).
const wrap = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  cave: wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17"/>'),
  list: wrap('<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4.2" cy="6.5" r=".8"/><circle cx="4.2" cy="12" r=".8"/><circle cx="4.2" cy="17.5" r=".8"/>'),
  add: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  edit: wrap('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>'),
  trash: wrap('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  bottle: wrap('<path d="M10 3h4v4.5c0 .8.5 1.500 1.200 2A4 4 0 0 1 17 12.800V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6.200a4 4 0 0 1 1.800-3.300C9.500 9 10 8.300 10 7.500z"/><path d="M7 14h10"/>'),
  filter: wrap('<path d="M4 5h16l-6 7.500V19l-4 1.500v-8z"/>'),
  arrowUp: wrap('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: wrap('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  tune: wrap('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = ICONS[name];
  return el;
}
