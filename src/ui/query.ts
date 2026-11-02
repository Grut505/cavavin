/** Paramètres de la partie `?a=b` du hash (ex. `#/ajouter/saisie?proposal=abc`). */
export function hashQuery(): URLSearchParams {
  const hash = window.location.hash;
  const i = hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
}
