// Ajout d'une bouteille : saisie manuelle ou pré-remplie depuis une proposition du projet Claude.
import type { AppContext } from '../../app';
import { findDuplicate } from '../../domain/duplicates';
import { bottleCounts, stocksAt } from '../../domain/locations';
import { urgencyByLocation } from '../../domain/urgency';
import { buildVocabulary, canonicalize, relatedFor, type VocabEntry } from '../../domain/vocabulary';
import {
  BOTTLE_FORMATS,
  WINE_COLORS,
  positionLabel,
  type Furniture,
  type PhotoSide,
  type Location,
  type Person,
  type PositionHint,
  type Proposal,
  type Wine,
} from '../../domain/types';
import { draftFromWine, emptyDraft, validateWine, type WineDraft } from '../../domain/wine';
import type { StockInput } from '../../data/repository';
import { makeThumbnail, toDataUrl, type Thumbnail } from '../../scan/image';
import { proposalToDraft } from '../../scan/proposal';
import { applyChanges, reconcile } from '../../scan/reconcile';
import { pageHeader } from '../components/page-header';
import { promptDialog } from '../components/dialog';
import { askSimilar } from '../components/similar-dialog';
import { askDuplicate } from '../components/duplicate-dialog';
import { locationLabel } from '../components/location-picker';
import { claudeProjectButton } from '../components/claude-project-link';
import { renderCaveMap } from '../cave-map/cave-map';
import { renderShelfPosition } from '../cave-map/shelf-position';
import { h } from '../dom';
import { icon } from '../icons';
import { originPath, originQuery } from '../nav-origin';
import { hashQuery } from '../query';
import { Router } from '../router';

interface Row {
  location: Location | null;
  quantity: number;
  hint: PositionHint | null;
}

const COLOR_LABELS: Record<string, string> = {
  rouge: 'Rouge',
  blanc: 'Blanc',
  rosé: 'Rosé',
  effervescent: 'Effervescent',
  liquoreux: 'Liquoreux',
  autre: 'Autre',
};

/** Ajout d'une bouteille (saisie manuelle ou proposition du projet Claude). */
export async function addWineView(ctx: AppContext): Promise<HTMLElement> {
  const proposalId = hashQuery().get('proposal');
  const proposal = proposalId ? await ctx.repo.get('proposal', proposalId) : undefined;
  return wineFormView(ctx, { proposal });
}

/** Modification d'une fiche existante (mêmes champs, sans la partie « emplacements »). */
export async function editWineView(ctx: AppContext, params: { id?: string }): Promise<HTMLElement> {
  const wine = params.id ? await ctx.repo.get('wine', params.id) : undefined;
  if (!wine) {
    return h(
      'main',
      { class: 'view' },
      pageHeader({ title: 'Fiche introuvable', back: '#/liste', backLabel: 'Retour à la liste' }),
      h('p', { class: 'muted' }, 'Cette fiche n’existe plus.'),
    );
  }
  return wineFormView(ctx, { wine });
}

async function wineFormView(ctx: AppContext, opts: { proposal?: Proposal; wine?: Wine }): Promise<HTMLElement> {
  const { proposal, wine: editing } = opts;
  const furniture: Furniture[] = await ctx.repo.list('furniture');
  const allLocations = await ctx.repo.list('location');
  const hasCave = allLocations.length > 0;
  const allStocks = await ctx.repo.list('stock');
  const allWines = await ctx.repo.list('wine');
  const existingPhotos = editing ? (await ctx.repo.photoUrls()).get(editing.id) : undefined;
  // Suggestions et graphies de référence tirées de la cave (s'enrichissent à chaque fiche enregistrée).
  const vocab = buildVocabulary(await ctx.repo.list('wine'));

  const initial: WineDraft = editing ? draftFromWine(editing) : proposal ? proposalToDraft(proposal) : emptyDraft();
  const rows: Row[] = [{ location: null, quantity: proposal?.quantity ?? 1, hint: null }];
  const thumbs: Partial<Record<PhotoSide, Thumbnail>> = {};
  const savePhotos = async (wineId: string): Promise<void> => {
    for (const side of ['avant', 'arrière'] as const) {
      const th = thumbs[side];
      if (th) await ctx.repo.setThumbnail(wineId, th, side);
    }
  };

  // --- champs ---
  const inputs = {} as Record<keyof WineDraft, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  const errors = {} as Record<keyof WineDraft, HTMLElement>;

  const field = (
    name: keyof WineDraft,
    label: string,
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    hint?: string,
  ): HTMLElement => {
    control.id = `f-${name}`;
    control.classList.add('field__input');
    control.value = initial[name];
    inputs[name] = control;
    const err = h('span', { class: 'field__error', id: `e-${name}`, role: 'alert' });
    errors[name] = err;
    control.setAttribute('aria-describedby', `e-${name}`);
    // L'erreur disparaît dès que l'utilisateur se remet à saisir ou à choisir.
    const clear = (): void => {
      err.textContent = '';
      control.removeAttribute('aria-invalid');
    };
    control.addEventListener('input', clear);
    control.addEventListener('change', clear);
    return h(
      'label',
      { class: 'field', for: `f-${name}` },
      h('span', { class: 'field__label' }, label),
      control,
      hint ? h('span', { class: 'muted', style: 'font-size:0.8rem' }, hint) : null,
      err,
    );
  };
  const text = (name: keyof WineDraft, label: string, attrs: Record<string, string | boolean> = {}, hint?: string): HTMLElement =>
    field(name, label, h('input', { type: 'text', autocomplete: 'off', ...attrs }), hint);
  const select = (
    name: keyof WineDraft,
    label: string,
    options: [string, string][],
    attrs: Record<string, string | boolean> = {},
  ): HTMLElement => field(name, label, h('select', attrs, options.map(([v, l]) => h('option', { value: v }, l))));

  /** Suggestions natives (datalist) : fonctionne sur iPhone et au clavier. */
  const datalist = (id: string, values: string[]): HTMLElement =>
    h('datalist', { id }, values.map((v) => h('option', { value: v })));
  const listOf = (entries: VocabEntry[]): string[] => entries.map((e) => e.value);
  const datalists = [
    datalist('dl-vintage', [...vocab.vintages.map(String), 'NV']),
    datalist('dl-appellation', listOf(vocab.appellation)),
    datalist('dl-region', listOf(vocab.region)),
    datalist('dl-country', listOf(vocab.country)),
  ];

  const tanninField = select('tannin', 'Tanin (rouges)', [
    ['', '—'],
    ['1', '1 · très souple'],
    ['2', '2 · souple'],
    ['3', '3 · médium'],
    ['4', '4 · ferme'],
    ['5', '5 · très tannique'],
  ]);
  const drynessField = select('dryness', 'Sucre (autres)', [
    ['', '—'],
    ['sec', 'Sec'],
    ['demi-sec', 'Demi-sec'],
    ['moelleux', 'Moelleux'],
    ['doux', 'Doux'],
  ]);
  const styleRow = h('div', { class: 'row' }, h('div', { class: 'grow' }, tanninField), h('div', { class: 'grow' }, drynessField));
  /** Le tanin ne concerne que les rouges, le sucre que les autres couleurs. */
  const syncStyleFields = (): void => {
    const color = inputs.color.value;
    tanninField.toggleAttribute('hidden', !(color === '' || color === 'rouge'));
    drynessField.toggleAttribute('hidden', color === 'rouge');
  };

  const identity = h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'La bouteille'),
    text('appellation', 'Appellation *', { required: true, list: 'dl-appellation', enterkeyhint: 'next' }),
    text('vintage', 'Millésime *', { required: true, inputmode: 'numeric', placeholder: '2019 ou NV', maxlength: '4', list: 'dl-vintage' }),
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'grow' }, text('region', 'Région', { list: 'dl-region' })),
      h('div', { class: 'grow' }, text('country', 'Pays', { list: 'dl-country' })),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        { class: 'grow' },
        select('color', 'Couleur *', [['', '— choisir —'], ...WINE_COLORS.map((c): [string, string] => [c, COLOR_LABELS[c] ?? c])], { required: true }),
      ),
      h('div', { class: 'grow' }, select('format', 'Format *', BOTTLE_FORMATS.map((f): [string, string] => [f, f]), { required: true })),
    ),
    styleRow,
    // Souvent introuvables sur l'étiquette : facultatifs.
    text('domain', 'Domaine (facultatif)'),
    text('cuvee', 'Cuvée (facultatif)', { placeholder: 'Ex. Les Pierres' }),
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'grow' }, text('drink_from', 'À boire à partir de', { inputmode: 'numeric', maxlength: '4', placeholder: '2025' })),
      h('div', { class: 'grow' }, text('drink_until', 'À boire avant', { inputmode: 'numeric', maxlength: '4', placeholder: '2030' })),
    ),
  );
  inputs.color.addEventListener('change', syncStyleFields);
  syncStyleFields();

  /**
   * Quand l'appellation est déjà connue de la cave, on propose sa région et son pays habituels
   * (sans jamais écraser ce que l'utilisateur a saisi).
   */
  const autofillRelated = (): void => {
    const rel = relatedFor(vocab, inputs.appellation.value);
    if (!rel) return;
    if (rel.region && inputs.region.value.trim() === '') inputs.region.value = rel.region;
    if (rel.country && inputs.country.value.trim() === '') inputs.country.value = rel.country;
  };
  inputs.appellation.addEventListener('input', autofillRelated);
  inputs.appellation.addEventListener('change', autofillRelated);

  // --- cadeau : « Offert par » choisi dans la liste des personnes (réglages) ---
  let persons: Person[] = await ctx.repo.persons();
  const giftBox = h('input', {
    type: 'checkbox',
    id: 'f-gift',
    role: 'switch',
    class: 'switch__input',
    ...(initial.gift === 'true' ? { checked: true } : {}),
  });
  const giftSelect = h('select', {});
  const drawGiftOptions = (selected: string): void => {
    giftSelect.replaceChildren(
      h('option', { value: '' }, persons.length === 0 ? '— (liste vide)' : '—'),
      ...persons.map((p) => h('option', { value: p.id }, p.name)),
    );
    giftSelect.value = selected;
  };
  const giftField = field('gift_from', 'Offert par', giftSelect);
  drawGiftOptions(initial.gift_from);
  const giftWrap = h(
    'div',
    { class: 'stack' },
    giftField,
    h(
      'button',
      {
        class: 'btn btn--small',
        type: 'button',
        onClick: async () => {
          const name = await promptDialog({ title: 'Nouvelle personne', label: 'Nom', confirmLabel: 'Ajouter' });
          if (name === null) return;
          try {
            const p = await ctx.repo.addPerson(name);
            persons = await ctx.repo.persons();
            drawGiftOptions(p.id);
          } catch (e) {
            alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, e instanceof Error ? e.message : String(e)));
          }
        },
      },
      icon('plus'),
      'Nouvelle personne',
    ),
    h('p', { class: 'muted', style: 'font-size:0.8rem' }, 'La liste se gère aussi dans Réglages › Personnes.'),
  );
  const syncGift = (): void => void giftWrap.toggleAttribute('hidden', !giftBox.checked);
  giftBox.addEventListener('change', syncGift);
  syncGift();
  const giftBlock = h(
    'div',
    { class: 'stack' },
    h(
      'label',
      { class: 'switch', for: 'f-gift' },
      giftBox,
      h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__thumb' })),
      h('span', { class: 'switch__label' }, 'Cadeau'),
    ),
    giftWrap,
  );

  const optional = h(
    'details',
    { class: 'card stack' },
    h('summary', { style: 'min-height:44px;display:flex;align-items:center;font-weight:600;cursor:pointer' }, 'Plus d’informations (facultatif)'),
    h(
      'div',
      { class: 'stack', style: 'margin-top:12px' },
      giftBlock,
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'grow' }, text('purchase_price', 'Prix d’achat (€)', { inputmode: 'decimal' })),
        h('div', { class: 'grow' }, text('purchase_date', 'Date d’achat', { placeholder: 'jj/mm/aaaa', inputmode: 'numeric' })),
      ),
      text('supplier', 'Fournisseur'),
      select('rating', 'Note', [['', '—'], ...[1, 2, 3, 4, 5].map((n): [string, string] => [String(n), `${n} / 5`])]),
      field('pairings', 'Mets conseillés', h('textarea', { rows: '2', placeholder: 'risotto aux champignons, gratin dauphinois, fromages à pâte dure…' }), 'Mets végétariens proposés par Claude à la lecture d’étiquette ; séparez-les par des virgules. « Quoi boire ce soir » se base sur cette liste.'),
      field('notes', 'Notes', h('textarea', { rows: '3' })),
    ),
  );

  // --- photos : avant et arrière, depuis la phototèque ou l'appareil photo ---
  const photoBox = h('div', { class: 'photos' });
  const drawPhotos = (): void => {
    const slot = (side: PhotoSide, title: string): HTMLElement => {
      const fresh = thumbs[side];
      const preview = fresh ? toDataUrl(fresh) : existingPhotos?.[side === 'avant' ? 'front' : 'back'];
      const pick = (capture: boolean): HTMLElement => {
        const id = `f-photo-${side}-${capture ? 'cam' : 'lib'}`;
        const input = h('input', { type: 'file', accept: 'image/*', ...(capture ? { capture: 'environment' } : {}), hidden: true, id });
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            thumbs[side] = await makeThumbnail(file);
          } catch {
            delete thumbs[side];
            alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, 'Photo illisible : la fiche peut être enregistrée sans photo.'));
          }
          drawPhotos();
        });
        return h('span', {}, input, h('label', { class: 'btn btn--small', for: id }, capture ? 'Appareil photo' : 'Phototèque'));
      };
      return h(
        'div',
        { class: 'photos__slot', 'data-side': side },
        h('strong', {}, title),
        preview ? h('img', { src: preview, alt: `Miniature : ${title.toLowerCase()}`, width: '72', style: 'border-radius:8px;height:auto' }) : h('span', { class: 'photos__empty muted' }, 'Aucune photo'),
        h('div', { class: 'row' }, pick(false), pick(true)),
        fresh ? h('button', { class: 'btn btn--small', type: 'button', onClick: () => { delete thumbs[side]; drawPhotos(); } }, 'Retirer') : null,
      );
    };
    photoBox.replaceChildren(slot('avant', 'Avant'), slot('arrière', 'Arrière'));
  };
  drawPhotos();
  const photoCard = h('section', { class: 'card stack' }, h('h2', {}, 'Photos'), h('p', { class: 'muted' }, 'Facultatif : l’avant et l’arrière de la bouteille, depuis la phototèque ou l’appareil photo. L’avant sert de miniature dans les listes.'), photoBox);

  // --- emplacements : choisis directement dans le formulaire (schéma de la cave, puis zone sur l'étagère) ---
  const rowsBox = h('div', { class: 'stack' });
  const drawRows = (): void => {
    const counts = bottleCounts(allStocks);
    const urgencies = urgencyByLocation(allStocks, allWines, new Date().getFullYear());
    rowsBox.replaceChildren(
      ...rows.map((row, i) => {
        const qty = h('input', {
          class: 'field__input',
          type: 'number',
          inputmode: 'numeric',
          min: '1',
          value: String(row.quantity),
          'aria-label': 'Quantité',
          style: 'width:84px',
        });
        qty.addEventListener('input', () => {
          row.quantity = Number(qty.value);
          alertBox.replaceChildren();
        });
        const loc = row.location;
        const hintCounts: Partial<Record<PositionHint, number>> = {};
        if (loc) for (const st of stocksAt(allStocks, loc.id)) if (st.position_hint) hintCounts[st.position_hint] = (hintCounts[st.position_hint] ?? 0) + st.quantity;
        return h(
          'div',
          { class: 'card stack', style: 'box-shadow:none', 'data-row': String(i) },
          h(
            'div',
            { class: 'row' },
            h('strong', { class: 'grow' }, rows.length > 1 ? `Emplacement ${i + 1}` : 'Emplacement'),
            rows.length > 1
              ? h('button', { class: 'icon-btn icon-btn--ghost icon-btn--danger', type: 'button', 'aria-label': 'Retirer cet emplacement', onClick: () => { rows.splice(i, 1); drawRows(); } }, icon('trash'))
              : null,
          ),
          h('p', { class: loc ? 'alert' : 'muted', 'data-chosen': loc ? 'yes' : 'no' }, loc ? `${locationLabel(loc, furniture)}${row.hint ? ` · ${positionLabel(row.hint)}` : ''}` : 'Touchez une étagère ou un lieu dans le schéma.'),
          renderCaveMap(
            { furniture, locations: allLocations, counts, urgencies },
            {
              selectedId: loc?.id,
              onSelect: (picked) => {
                row.location = picked;
                row.hint = null; // la zone dépend de l'étagère
                alertBox.replaceChildren();
                drawRows();
              },
            },
          ),
          loc && loc.kind === 'shelf'
            ? h(
                'div',
                { class: 'stack' },
                h('p', { class: 'muted' }, 'Position sur l’étagère (facultatif) : touchez une zone, une seconde fois pour la désélectionner.'),
                renderShelfPosition({ shelfName: loc.name, selected: row.hint, counts: hintCounts, onChange: (hint) => { row.hint = hint; drawRows(); } }).el,
              )
            : null,
          h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Quantité'), qty),
        );
      }),
      h('button', { class: 'btn btn--small', type: 'button', onClick: () => { rows.push({ location: null, quantity: 1, hint: null }); drawRows(); } }, icon('plus'), 'Ajouter un autre emplacement'),
    );
  };
  drawRows();
  const stockCard = h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Où la ranger ?'),
    hasCave ? null : h('p', { class: 'alert' }, 'Votre cave n’a pas encore d’emplacement. ', h('a', { href: '#/cave/config' }, 'Configurer ma cave')),
    rowsBox,
  );

  // --- soumission ---
  const alertBox = h('div', { role: 'alert', 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, editing ? 'Enregistrer les modifications' : 'Enregistrer');

  const readDraft = (): WineDraft => {
    const d = emptyDraft();
    (Object.keys(d) as (keyof WineDraft)[]).forEach((k) => (d[k] = inputs[k]?.value ?? d[k]));
    d.gift = giftBox.checked ? 'true' : '';
    return d;
  };

  const stockInputs = (): StockInput[] | string => {
    const picked = rows.filter((r) => r.location);
    if (picked.length === 0) return 'Choisissez au moins un emplacement.';
    for (const r of picked) {
      if (!Number.isInteger(r.quantity) || r.quantity < 1) return 'Chaque quantité doit être un entier supérieur ou égal à 1.';
    }
    return picked.map((r) => ({ location_id: r.location!.id, quantity: r.quantity, position_hint: r.hint }));
  };

  const onSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    alertBox.replaceChildren();
    Object.values(errors).forEach((el) => (el.textContent = ''));
    Object.values(inputs).forEach((el) => el.removeAttribute('aria-invalid'));

    const draft = readDraft();
    if (draft.color === 'rouge') draft.dryness = '';
    else if (draft.color !== '') draft.tannin = '';
    const res = validateWine(draft);
    if (!res.ok) {
      for (const issue of res.issues) {
        errors[issue.field].textContent = issue.message;
        inputs[issue.field].setAttribute('aria-invalid', 'true');
      }
      inputs[res.issues[0]!.field].focus();
      return;
    }

    submit.setAttribute('disabled', '');
    try {
      // Évite les entrées « presque pareilles » : graphie de référence ou confirmation si valeur proche.
      const fields = { ...res.value };
      const names = { appellation: 'Appellation', region: 'Région', country: 'Pays' } as const;
      for (const f of ['appellation', 'region', 'country'] as const) {
        const raw = fields[f];
        if (!raw) continue;
        const c = canonicalize(vocab[f], raw);
        if (c.kind === 'same') {
          fields[f] = c.value;
          inputs[f].value = c.value;
        } else if (c.kind === 'close') {
          const choice = await askSimilar({ label: names[f], typed: c.typed, suggestion: c.suggestion });
          if (choice === null) return;
          if (choice === 'use') {
            fields[f] = c.suggestion;
            inputs[f].value = c.suggestion;
          }
        }
      }

      if (editing) {
        // Modification : l'identité (domaine, cuvée, millésime) ne doit pas rejoindre celle d'une autre fiche.
        const others = (await ctx.repo.list('wine')).filter((w) => w.id !== editing.id);
        if (findDuplicate(others, fields)?.match === 'exact') {
          alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, 'Une autre fiche a déjà cette identité (domaine, cuvée, millésime).'));
          return;
        }
        await ctx.repo.updateWine(editing.id, fields);
        await savePhotos(editing.id);
        Router.go(leaveTo(editing.id).replace(/^#/, ''));
        return;
      }

      const wines = await ctx.repo.list('wine');
      const target = proposal?.target_wine_id ? wines.find((w) => w.id === proposal.target_wine_id) : undefined;
      const dup = target ? { wine: target, match: 'exact' as const } : findDuplicate(wines, fields);
      let goTo = '/cave';

      if (dup) {
        const source: Parameters<typeof reconcile>[1] = { ...fields };
        if (fields.format === '75cl') delete source.format; // valeur par défaut : pas une saisie
        const changes = reconcile(dup.wine, source);
        const bottles = (await ctx.repo.list('stock'))
          .filter((s) => s.wine_id === dup.wine.id && s.quantity > 0)
          .reduce((n, s) => n + s.quantity, 0);
        const choice = await askDuplicate({ existing: dup.wine, match: dup.match, bottles, changes });
        if (!choice) return;
        if (choice.choice === 'add') {
          const stocks = stockInputs();
          if (typeof stocks === 'string') {
            alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, stocks));
            return;
          }
          for (const st of stocks) await ctx.repo.addStock(dup.wine.id, st);
          goTo = `/etagere/${stocks[0]!.location_id}`;
        } else {
          await ctx.repo.completeWine(dup.wine.id, applyChanges(changes, choice.accepted));
        }
        if (thumbs.avant && !dup.wine.thumb_ref) await ctx.repo.setThumbnail(dup.wine.id, thumbs.avant, 'avant');
        if (thumbs.arrière) await ctx.repo.setThumbnail(dup.wine.id, thumbs.arrière, 'arrière');
      } else {
        const stocks = stockInputs();
        if (typeof stocks === 'string') {
          alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, stocks));
          return;
        }
        const created = await ctx.repo.addWine(fields, stocks);
        await savePhotos(created.id);
        goTo = `/etagere/${stocks[0]!.location_id}`;
      }

      if (proposal) await ctx.repo.resolveProposal(proposal.id, 'importée');
      Router.go(goTo);
    } catch (err) {
      alertBox.replaceChildren(h('p', { class: 'alert alert--error' }, `Enregistrement impossible : ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      submit.removeAttribute('disabled');
    }
  };

  // Modification lancée par un balayage depuis une liste (`direct=1`) : on revient à cette liste, pas à la fiche.
  const direct = hashQuery().get('direct') === '1';
  const leaveTo = (wineId: string): string => (direct && originPath() ? `#${originPath()}` : `#/vin/${wineId}${originQuery()}`);

  const form = h(
    'form',
    { class: 'stack form--with-bar', novalidate: true, onSubmit: (e: Event) => void onSubmit(e) },
    editing ? null : claudeProjectButton({ small: true }),
    proposal ? h('p', { class: 'alert' }, 'Pré-rempli à partir de la proposition de Claude : vérifiez, corrigez si besoin, puis choisissez l’emplacement.') : null,
    identity,
    ...datalists,
    photoCard,
    ...(editing ? [] : [stockCard]),
    optional,
    // Barre collante : « Enregistrer » reste visible, quel que soit le défilement.
    h('div', { class: 'form-bar' }, alertBox, submit),
  );

  return h(
    'main',
    { class: 'view' },
    pageHeader({
      title: editing ? 'Modifier la fiche' : 'Ajouter une bouteille',
      back: editing ? leaveTo(editing.id) : '#/ajouter',
      backLabel: editing && direct && originPath() ? (originPath() === '/liste' ? 'Retour à la liste' : 'Retour') : undefined,
    }),
    form,
  );
}
