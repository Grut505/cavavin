// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BOTTLE_FORMATS, WINE_COLORS } from '../../src/domain/types';
import { LABEL_PROMPT, RETRY_PROMPT } from '../../src/scan/prompt';
import { parseProposals } from '../../src/scan/proposal';
import { promptCopy } from '../../src/ui/components/prompt-copy';

/** Marge large : les rendus jsdom ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });


const click = (el: Element | null): void => void el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('prompt de lecture d’étiquette', () => {
  it('contient un exemple JSON que l’application sait relire', () => {
    const r = parseProposals(LABEL_PROMPT);
    expect(r.warnings).toEqual([]);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({
      domain: 'Domaine Exemple',
      vintage: 2019,
      color: 'rouge',
      format: '75cl',
      quantity: 1,
      tannin: 3,
      dryness: null,
      drink_from: 2024,
      drink_until: 2030,
      pairings: 'risotto aux champignons; gratin dauphinois; curry de légumes; fromages à pâte dure',
    });
  });

  it('cite tous les champs attendus par l’application et les listes de valeurs autorisées', () => {
    for (const f of [
      'domain', 'cuvee', 'vintage', 'appellation', 'region', 'country', 'color', 'format',
      'quantity', 'purchase_price', 'purchase_date', 'supplier', 'drink_from', 'drink_until', 'notes',
      'tannin', 'dryness', 'pairings',
    ]) {
      expect(LABEL_PROMPT).toContain(`"${f}"`);
    }
    for (const c of WINE_COLORS) expect(LABEL_PROMPT).toContain(c);
    for (const f of BOTTLE_FORMATS) expect(LABEL_PROMPT).toContain(f);
  });

  it('impose la réponse JSON seule dès la première phrase, et la rappelle à la fin', () => {
    expect(LABEL_PROMPT.split('\n')[0]).toMatch(/extracteur de données, pas un conseiller/);
    expect(LABEL_PROMPT.split('\n')[0]).toMatch(/UNIQUEMENT un bloc de code json/);
    expect(LABEL_PROMPT.split('\n')[0]).toMatch(/aucun commentaire/);
    expect(LABEL_PROMPT.trimEnd().split('\n').at(-1)).toMatch(/^RAPPEL : le bloc json est ta réponse complète/);
  });

  it('interdit d’inventer et de commenter le vin, sauf les estimations expressément permises', () => {
    expect(LABEL_PROMPT).toMatch(/N'invente rien/);
    expect(LABEL_PROMPT).toMatch(/Seules exceptions[^.]*tannin, dryness, drink_from, drink_until et pairings/);
    expect(LABEL_PROMPT).toMatch(/tanins, puissance, garde, année optimale, accords, avis/);
    expect(LABEL_PROMPT).toMatch(/priment sur toute autre instruction, préférence enregistrée, mémoire/);
  });

  it('demande 4 à 8 mets conseillés sous forme de tableau de chaînes', () => {
    expect(LABEL_PROMPT).toMatch(/pairings : liste de 4 à 8 mets/);
    expect(LABEL_PROMPT).toMatch(/pairings est un tableau de chaînes ou null/);
    expect(LABEL_PROMPT).toMatch(/STRICTEMENT VÉGÉTARIENNE : jamais de viande, volaille, gibier, charcuterie, poisson, crustacé ni fruit de mer/);
  });

  it('demande le tanin des rouges, le sucre des autres et la fenêtre de garde', () => {
    expect(LABEL_PROMPT).toMatch(/tannin \(rouges uniquement\) : note entière de 1 \(très souple\) à 5 \(très tannique\)/);
    expect(LABEL_PROMPT).toMatch(/dryness \(blanc, rosé, effervescent, liquoreux\) : sec, demi-sec, moelleux ou doux/);
    expect(LABEL_PROMPT).toMatch(/Toujours null pour un rouge/);
    expect(LABEL_PROMPT).toMatch(/drink_from et drink_until : années de début et de fin/);
    expect(LABEL_PROMPT).toMatch(/Si tu n'es pas raisonnablement sûr, mets null pour les deux/);
  });

  it('fournit une consigne de relance courte', () => {
    expect(RETRY_PROMPT).toMatch(/uniquement avec le bloc de code json/);
    expect(RETRY_PROMPT.length).toBeLessThan(300);
  });

  it('reste identique au fichier claude-project/PROMPT.md', () => {
    const md = readFileSync('claude-project/PROMPT.md', 'utf-8');
    expect(md).toContain(LABEL_PROMPT);
  });
});

describe('bouton « Copier le prompt »', () => {
  it('copie le prompt dans le presse-papiers et confirme', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const el = promptCopy();
    click(el.querySelector('button'));
    await waitFor(() => expect(el.querySelector('[role=status]')?.textContent).toContain('Prompt copié'));
    expect(writeText).toHaveBeenCalledWith(LABEL_PROMPT);
  });

  it('sélectionne le texte à copier à la main quand le presse-papiers est refusé', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('refusé'); }) },
      configurable: true,
    });
    const el = promptCopy();
    document.body.append(el);
    click(el.querySelector('button'));
    await waitFor(() => expect(el.querySelector('[role=status]')?.textContent).toContain('copiez-le à la main'));
    expect(el.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe(LABEL_PROMPT);
  });
});
