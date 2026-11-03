// Jeu de données FICTIF pour le teaser : aucune donnée réelle. Les fenêtres de garde sont calculées à partir de
// l'année donnée pour que tous les statuts (en retard, à finir, à point, bientôt, trop tôt) soient visibles.
const ISO = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// [domaine, cuvée, millésime, appellation, région, pays, couleur, début, fin (relatifs à l'année), tanin, sucre, prix, mets]
const WINES = [
  ['Domaine des Pierres Claires', 'Les Cabanes', 2015, 'Saint-Joseph', 'Vallée du Rhône', 'France', 'rouge', -8, -1, 3, null, 24, 'risotto aux champignons; gratin dauphinois; fromages à pâte dure; lasagnes aux légumes'],
  ['Château Beaulieu-Sud', 'Grand Vin', 2012, 'Pauillac', 'Bordeaux', 'France', 'rouge', -6, 0, 5, null, 62, 'aubergines grillées; fromages affinés; champignons rôtis; polenta crémeuse'],
  ['Domaine Lamberterie', 'Vieilles Vignes', 2018, 'Gevrey-Chambertin', 'Bourgogne', 'France', 'rouge', -2, 1, 3, null, 48, 'tarte aux champignons; risotto de potimarron; fromages à pâte molle; omelette aux cèpes'],
  ['Clos du Moulin Blanc', 'Cuvée Marcel', 2019, 'Côtes-du-Rhône', 'Vallée du Rhône', 'France', 'rouge', -3, 4, 3, null, 12, 'curry de légumes; gratin dauphinois; pizza aux légumes grillés; fromages à pâte dure'],
  ['Domaine Fontaine-Haute', 'Terres Rouges', 2020, 'Crozes-Hermitage', 'Vallée du Rhône', 'France', 'rouge', 0, 6, 3, null, 19, 'ratatouille; lasagnes aux légumes; fromages à pâte dure; falafels'],
  ['Cave de la Garrigue', 'Mas des Oliviers', 2021, 'Languedoc', 'Languedoc-Roussillon', 'France', 'rouge', 0, 5, 2, null, 9, 'pizza aux légumes grillés; ratatouille; tian de légumes; pâtes à la tomate'],
  ['Castello Monte Alto', 'Riserva', 2016, 'Barolo', 'Piémont', 'Italie', 'rouge', 0, 10, 5, null, 55, 'risotto aux cèpes; gnocchis à la sauge; parmesan affiné; tarte aux champignons'],
  ['Bodega Alta Sierra', 'Gran Reserva', 2014, 'Rioja', 'Rioja', 'Espagne', 'rouge', -1, 4, 4, null, 29, 'poivrons farcis; aubergines grillées; manchego; paella de légumes'],
  ['Domaine Vignes-Hautes', 'Les Graviers', 2022, 'Sancerre', 'Loire', 'France', 'blanc', 0, 4, null, 'sec', 21, 'salade de chèvre chaud; asperges; quiche aux poireaux; fromages de chèvre'],
  ['Maison Lacroix-Verdier', 'Clos Saint-Pierre', 2020, 'Chablis Premier Cru', 'Bourgogne', 'France', 'blanc', -2, 1, null, 'sec', 34, 'gratin de courgettes; risotto aux asperges; comté; tarte aux poireaux'],
  ['Domaine de la Source Claire', 'Vieilles Vignes', 2017, 'Vouvray', 'Loire', 'France', 'blanc', -4, 2, null, 'demi-sec', 17, 'curry de légumes; tajine de légumes; fromages bleus; tarte tatin aux endives'],
  ['Weingut Sonnenhang', 'Kabinett', 2019, 'Riesling', 'Mosel', 'Allemagne', 'blanc', -3, 8, null, 'moelleux', 22, 'curry thaï aux légumes; samoussas; fromages à pâte persillée; pad thaï'],
  ['Domaine du Haut-Clos', 'Les Murets', 2023, 'Muscadet Sèvre-et-Maine', 'Loire', 'France', 'blanc', 0, 3, null, 'sec', 11, 'quiche aux poireaux; salade de chèvre chaud; risotto aux asperges; tarte fine aux légumes'],
  ['Domaine Rosière', 'Cuvée Provence', 2024, 'Côtes-de-Provence', 'Provence', 'France', 'rosé', 0, 2, null, 'sec', 13, 'salade grecque; tian de légumes; pizza margherita; falafels'],
  ['Maison Perlière', 'Brut Tradition', null, 'Champagne', 'Champagne', 'France', 'effervescent', -1, 5, null, 'sec', 38, 'blinis; gougères; fromages à pâte molle; tempura de légumes'],
  ['Domaine de la Perle Dorée', 'Cuvée Prestige', 2018, 'Crémant de Bourgogne', 'Bourgogne', 'France', 'effervescent', -2, 4, null, 'sec', 16, 'gougères; tartelettes aux poireaux; fromages frais; salade de chèvre'],
  ['Château Miel-d’Or', 'Vendanges Tardives', 2015, 'Sauternes', 'Bordeaux', 'France', 'liquoreux', 0, 15, null, 'doux', 44, 'fromages bleus; tarte aux poires; roquefort; foie gras végétal'],
  ['Domaine Mont-Brun', 'Les Arènes', 2019, 'Chinon', 'Loire', 'France', 'rouge', -1, 5, 2, null, 15, 'omelette aux champignons; gratin de légumes; fromages de chèvre; tarte aux légumes'],
  ['Clos des Hirondelles', 'Réserve', 2010, 'Madiran', 'Sud-Ouest', 'France', 'rouge', -9, -2, 5, null, 28, 'cassoulet végétarien; aubergines grillées; fromages affinés; champignons rôtis'],
  ['Cave du Val Fleuri', 'Gamay Nouveau', 2023, 'Beaujolais-Villages', 'Beaujolais', 'France', 'rouge', -1, 2, 2, null, 10, 'quiche aux légumes; pizza aux légumes; fromages frais; tarte à la tomate'],
  ['Domaine des Trois Chênes', 'Prestige', 2005, 'Saint-Émilion Grand Cru', 'Bordeaux', 'France', 'rouge', -12, -3, 4, null, 52, 'champignons rôtis; risotto aux cèpes; fromages affinés; polenta crémeuse'],
  ['Weingut Hügelgrund', 'Spätburgunder', 2021, 'Pinot noir', 'Baden', 'Allemagne', 'rouge', 1, 8, 2, null, 18, 'risotto de potimarron; tarte aux champignons; fromages à pâte molle; gnocchis'],
  ['Domaine Pic-Vert', 'Altitude', 2022, 'Gaillac', 'Sud-Ouest', 'France', 'blanc', 0, 3, null, 'sec', 9, 'salade de chèvre chaud; quiche aux poireaux; asperges; tarte fine aux légumes'],
  ['Maison Ardoise', 'Terroir de Schiste', 2018, 'Faugères', 'Languedoc-Roussillon', 'France', 'rouge', -1, 6, 3, null, 14, 'ratatouille; tian de légumes; lasagnes aux légumes; fromages à pâte dure'],
];

// [indice du vin, indice d'étagère (0..6), quantité, position]
const STOCKS = [
  [0, 0, 2, 'dessus-gauche'], [1, 0, 1, 'dessus-centre'], [2, 0, 3, 'milieu-gauche'], [3, 0, 6, 'milieu-droite'], [20, 0, 1, 'dessous-gauche'],
  [4, 1, 4, 'dessus-droite'], [5, 1, 6, 'milieu-centre'], [6, 1, 2, 'dessous-droite'], [7, 1, 3, 'milieu-gauche'],
  [8, 2, 3, 'dessus-gauche'], [9, 2, 2, 'dessus-centre'], [10, 2, 2, 'milieu-droite'], [11, 2, 1, 'dessous-centre'], [12, 2, 6, 'dessous-droite'],
  [13, 3, 4, 'milieu-gauche'], [14, 3, 3, 'milieu-centre'], [15, 3, 6, 'dessus-droite'], [16, 3, 1, 'dessous-gauche'],
  [17, 4, 3, 'milieu-centre'], [18, 4, 1, 'dessous-droite'], [19, 4, 6, 'dessus-gauche'],
  [21, 5, 2, 'milieu-droite'], [22, 5, 4, 'dessus-centre'], [23, 6, 3, 'milieu-gauche'], [4, 6, 2, null],
];

const COLORS = { rouge: ['#7a1f2e', '#c9a3a9'], blanc: ['#d9c77a', '#4a4325'], rosé: ['#e8a5ad', '#5a2a30'], effervescent: ['#c8d38a', '#3d4420'], liquoreux: ['#d9a441', '#4a3410'] };

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Étiquette stylisée (SVG, encodé en base64) : aucune vraie photo. */
function labelSvg(domain, cuvee, vintage, color) {
  const [bg, fg] = COLORS[color] ?? COLORS.rouge;
  const lines = esc(domain.replace(/^(Domaine|Château|Maison|Cave|Clos|Castello|Bodega|Weingut)\s+(de la |du |des |de |d’)?/i, '')).slice(0, 18);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><rect width="120" height="160" fill="#2a2321"/>` +
    `<rect x="14" y="14" width="92" height="132" rx="4" fill="${bg}"/><rect x="20" y="20" width="80" height="120" rx="2" fill="none" stroke="${fg}" stroke-opacity=".5"/>` +
    `<text x="60" y="62" text-anchor="middle" font-family="Georgia,serif" font-size="11" fill="${fg}">${lines}</text>` +
    `<text x="60" y="86" text-anchor="middle" font-family="Georgia,serif" font-size="9" fill="${fg}" font-style="italic">${esc(cuvee).slice(0, 20)}</text>` +
    `<text x="60" y="124" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="${fg}">${vintage ?? 'NV'}</text></svg>`
  );
}

export function buildSeed(year) {
  const now = new Date().toISOString();
  const base = (id) => ({ id, rev: 1, updated_at: now, deleted: false });
  const out = { wine: [], furniture: [], location: [], stock: [], outflow: [], photo: [], proposal: [], person: [] };

  const people = ['Marie', 'Julien', 'Thomas'].map((name, i) => ({ ...base(`p${i}`), name, order: i }));
  out.person = people;

  out.furniture = [
    { ...base('f0'), name: 'Armoire principale', order: 0 },
    { ...base('f1'), name: 'Cellier', order: 1 },
  ];
  const shelves = [];
  for (let i = 0; i < 4; i++) shelves.push({ ...base(`l${i}`), kind: 'shelf', furniture_id: 'f0', name: `Étagère ${i + 1}`, order: i });
  for (let i = 0; i < 3; i++) shelves.push({ ...base(`l${4 + i}`), kind: 'shelf', furniture_id: 'f1', name: `Étagère ${i + 1}`, order: i });
  out.location = shelves;

  WINES.forEach((w, i) => {
    const [domain, cuvee, vintage, appellation, region, country, color, from, until, tannin, dryness, price, pairings] = w;
    const id = `w${i}`;
    const gift = i === 1 || i === 6 || i === 16;
    out.wine.push({
      ...base(id), domain, cuvee, vintage, appellation, region, country, color, format: '75cl',
      drink_from: year + from, drink_until: year + until, purchase_price: price, purchase_date: ISO(year - 1, 3 + (i % 8), 1 + (i % 25)),
      supplier: i % 3 === 0 ? 'Caviste du coin' : null, rating: i % 5 === 0 ? 4 : null, notes: null,
      thumb_ref: `ph${i}`, legacy_ref: null, needs_review: false, created_at: now,
      tannin, dryness, gift, gift_from: gift ? people[i % 3].id : null, pairings, to_buy: i === 5 || i === 13,
    });
    out.photo.push({
      ...base(`ph${i}`), wine_id: id, side: 'avant', mime: 'image/svg+xml', width: 120, height: 160,
      data: Buffer.from(labelSvg(domain, cuvee, vintage, color)).toString('base64'),
    });
  });

  STOCKS.forEach(([wi, si, quantity, position_hint], i) => {
    out.stock.push({ ...base(`s${i}`), wine_id: `w${wi}`, location_id: `l${si}`, quantity, position_hint });
  });

  const outflows = [[3, 'drunk', ISO(year, 10, 18), 'Avec des amis, très bon.'], [9, 'drunk', ISO(year, 10, 2), null], [14, 'gifted', ISO(year, 9, 20), 'Pour l’anniversaire de Marie'], [5, 'drunk', ISO(year, 9, 5), null], [12, 'drunk', ISO(year, 8, 14), 'Apéritif d’été'], [18, 'broken', ISO(year, 7, 1), 'Bouchonnée']];
  outflows.forEach(([wi, reason, date, note], i) => {
    out.outflow.push({ ...base(`o${i}`), wine_id: `w${wi}`, location_id: `l${wi % 7}`, reason, date, note });
  });
  return out;
}
