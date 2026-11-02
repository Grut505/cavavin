// Liste paramétrable de personnes (donateurs de cadeaux).
import { normalizeText } from './normalize';
import type { Person } from './types';

export type PersonRuleCode = 'empty_name' | 'duplicate';

export class PersonRuleError extends Error {
  constructor(
    message: string,
    readonly code: PersonRuleCode,
  ) {
    super(message);
    this.name = 'PersonRuleError';
  }
}

/** Nom nettoyé, vide et doublons (accents/casse ignorés) refusés. */
export function assertPersonName(raw: string, persons: Person[], exceptId?: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new PersonRuleError('Le nom ne peut pas être vide.', 'empty_name');
  const key = normalizeText(clean);
  if (persons.some((p) => !p.deleted && p.id !== exceptId && normalizeText(p.name) === key)) {
    throw new PersonRuleError(`« ${clean} » est déjà dans la liste.`, 'duplicate');
  }
  return clean;
}

export function sortPersons(persons: Person[]): Person[] {
  return [...persons]
    .filter((p) => !p.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

export function nextPersonOrder(persons: Person[]): number {
  const active = persons.filter((p) => !p.deleted);
  return active.length === 0 ? 0 : Math.max(...active.map((p) => p.order)) + 1;
}
