import { describe, expect, it } from 'vitest';
import { ProposalParseError, parseProposals, proposalToDraft } from '../../src/scan/proposal';

const one = {
  v: 1,
  domain: 'Domaine X',
  cuvee: 'Les Y',
  vintage: 2019,
  appellation: 'Saint-Joseph',
  region: 'Rhône',
  country: 'France',
  color: 'rouge',
  format: '75cl',
  quantity: 2,
};

describe('parseProposals', () => {
  it('lit un objet JSON seul', () => {
    const r = parseProposals(JSON.stringify(one));
    expect(r.warnings).toEqual([]);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ domain: 'Domaine X', vintage: 2019, quantity: 2, color: 'rouge' });
  });

  it('lit un tableau de propositions', () => {
    const r = parseProposals(JSON.stringify([one, { ...one, domain: 'Autre', vintage: 2020 }]));
    expect(r.proposals.map((p) => p.domain)).toEqual(['Domaine X', 'Autre']);
  });

  it('extrait le JSON d’un bloc ```json entouré de texte', () => {
    const text = `Voici la proposition :\n\n\`\`\`json\n${JSON.stringify(one)}\n\`\`\`\n\nDites-moi si c'est bon.`;
    expect(parseProposals(text).proposals[0]?.domain).toBe('Domaine X');
  });

  it('extrait un objet noyé dans du texte, accolades dans les chaînes comprises', () => {
    const text = `Résultat: ${JSON.stringify({ ...one, notes: 'cuvée {spéciale} 2019' })} — fin.`;
    expect(parseProposals(text).proposals[0]?.notes).toBe('cuvée {spéciale} 2019');
  });

  it('échoue clairement quand il n’y a pas de JSON exploitable', () => {
    expect(() => parseProposals('bonjour')).toThrow(ProposalParseError);
    expect(() => parseProposals('{ pas du json }')).toThrow(ProposalParseError);
    expect(() => parseProposals('[]')).toThrow(ProposalParseError);
  });

  it('met null pour l’inconnu et accepte les millésimes en texte ou NV', () => {
    const r = parseProposals(JSON.stringify({ domain: 'X', vintage: '2018', color: null }));
    expect(r.proposals[0]).toMatchObject({ vintage: 2018, color: null, cuvee: null });
    const nv = parseProposals(JSON.stringify({ domain: 'X', vintage: 'NV' }));
    expect(nv.proposals[0]?.vintage).toBeNull();
    expect(nv.warnings).toEqual([]);
  });

  it('normalise couleurs et formats usuels', () => {
    const r = parseProposals(
      JSON.stringify([
        { domain: 'A', color: 'Rosé', format: 'Magnum' },
        { domain: 'B', color: 'white', format: '0,75 L' },
        { domain: 'C', color: 'Champagne', format: '37,5 cl' },
      ]),
    );
    expect(r.proposals.map((p) => [p.color, p.format])).toEqual([
      ['rosé', 'magnum'],
      ['blanc', '75cl'],
      ['effervescent', 'demi'],
    ]);
  });

  it('ignore les champs invalides avec un avertissement, sans inventer de valeur', () => {
    const r = parseProposals(JSON.stringify({ domain: 'X', vintage: 3000, color: 'bleu', quantity: -2, purchase_price: 'cher' }));
    expect(r.proposals[0]).toMatchObject({ vintage: null, color: null, quantity: null, purchase_price: null });
    expect(r.warnings.join(' ')).toMatch(/vintage/);
    expect(r.warnings.join(' ')).toMatch(/color/);
    expect(r.warnings.join(' ')).toMatch(/quantity/);
  });

  it('lit le tanin (1 à 5) et normalise le niveau de sucre', () => {
    const r = parseProposals(
      JSON.stringify([
        { domain: 'A', color: 'rouge', tannin: 3 },
        { domain: 'B', color: 'blanc', dryness: 'Demi-sec' },
        { domain: 'C', color: 'effervescent', dryness: 'Brut' },
        { domain: 'D', color: 'blanc', dryness: 'liquoreux' },
      ]),
    );
    expect(r.warnings).toEqual([]);
    expect(r.proposals.map((p) => [p.tannin, p.dryness])).toEqual([
      [3, null],
      [null, 'demi-sec'],
      [null, 'sec'],
      [null, 'doux'],
    ]);
  });

  it('ignore un tanin hors 1–5 ou un sucre inconnu avec un avertissement', () => {
    const r = parseProposals(JSON.stringify({ domain: 'A', tannin: 8, dryness: 'sucré' }));
    expect(r.proposals[0]).toMatchObject({ tannin: null, dryness: null });
    expect(r.warnings.join(' ')).toMatch(/tannin/);
    expect(r.warnings.join(' ')).toMatch(/dryness/);
  });

  it('accepte la fenêtre de garde estimée', () => {
    const r = parseProposals(JSON.stringify({ domain: 'A', drink_from: 2025, drink_until: 2031 }));
    expect(r.proposals[0]).toMatchObject({ drink_from: 2025, drink_until: 2031 });
  });

  it('ignore une entrée sans aucune identité et signale laquelle', () => {
    const r = parseProposals(JSON.stringify([{ vintage: 2019 }, one]));
    expect(r.proposals).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/Proposition 1/);
  });

  it('conserve la source brute et l’identifiant de la fiche ciblée', () => {
    const r = parseProposals(JSON.stringify({ ...one, target_wine_id: 'abc' }));
    expect(r.proposals[0]?.target_wine_id).toBe('abc');
    expect(JSON.parse(r.proposals[0]!.raw_json).domain).toBe('Domaine X');
  });
});

describe('proposalToDraft', () => {
  it('pré-remplit le formulaire (texte brut)', () => {
    const p = parseProposals(JSON.stringify({ ...one, purchase_price: 12.5, purchase_date: '2024-03-05' })).proposals[0]!;
    const d = proposalToDraft(p);
    expect(d).toMatchObject({
      domain: 'Domaine X',
      cuvee: 'Les Y',
      vintage: '2019',
      color: 'rouge',
      format: '75cl',
      purchase_price: '12,5',
      purchase_date: '05/03/2024',
      tannin: '',
      dryness: '',
    });
  });
});
