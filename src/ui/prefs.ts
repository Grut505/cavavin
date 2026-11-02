// Préférences d'affichage propres à l'appareil (tri, filtres) : simple confort, jamais vital.
const PREFIX = 'cavavin.';

export function loadPref<T>(key: string, fallback: T, normalize: (raw: unknown) => T | null): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return normalize(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : on ignore */
  }
}
