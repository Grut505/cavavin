// Adresse du projet Claude qui lit les étiquettes : réglée une fois par appareil dans Réglages
// (ou fournie au déploiement par `VITE_CLAUDE_PROJECT_URL`). Elle n'est volontairement pas dans le code publié.
import { loadPref, savePref } from './prefs';

const KEY = 'claude.projectUrl';

/** `https://…` valide, sinon `null`. */
export function normalizeProjectUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v === '') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Adresse enregistrée dans Réglages, sinon celle du déploiement, sinon `null`. */
export function claudeProjectUrl(): string | null {
  const saved = loadPref<string | null>(KEY, null, (raw) => normalizeProjectUrl(raw));
  return saved ?? normalizeProjectUrl(import.meta.env.VITE_CLAUDE_PROJECT_URL);
}

/** Enregistre (ou, avec une chaîne vide, efface) l'adresse ; retourne `false` si elle est invalide. */
export function setClaudeProjectUrl(raw: string): boolean {
  if (raw.trim() === '') {
    savePref(KEY, null);
    return true;
  }
  const url = normalizeProjectUrl(raw);
  if (!url) return false;
  savePref(KEY, url);
  return true;
}
