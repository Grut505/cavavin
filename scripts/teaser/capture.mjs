// Capture des écrans du teaser à partir de la VRAIE application (build local) avec des données fictives.
// Usage : node scripts/teaser/capture.mjs   (voir run.sh). Playwright n'est pas une dépendance du projet :
// indiquez son emplacement avec PLAYWRIGHT_CORE=/chemin/vers/node_modules/playwright-core (ou installez-le ailleurs).
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSeed } from './seed.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'public/teaser/img';
const VIDEO_DIR = process.env.TEASER_VIDEO_DIR ?? '/tmp/cavavin-teaser-video';
const year = new Date().getFullYear();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
rmSync(VIDEO_DIR, { recursive: true, force: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  locale: 'fr-FR',
  serviceWorkers: 'block',
  recordVideo: { dir: VIDEO_DIR, size: { width: 390, height: 844 } },
});
// Masque ce qui parle de la connexion Google (démo hors-ligne) pour des écrans propres.
await context.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '.sync-chips,.reconnect-banner,.update-banner{display:none!important}';
    document.head.append(st);
  });
});
const page = await context.newPage();
const pause = (ms = 900) => page.waitForTimeout(ms);
let n = 0;
const shot = async (name) => {
  await pause(700);
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 84 });
  console.log('✓', name);
};
const go = async (hash) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await pause(900);
};
/** Glisse la ligne vers la gauche (événements tactiles synthétiques, comme un doigt). */
const swipeLeft = (selector) =>
  page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const fire = (type, x) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: r.top + r.height / 2 });
      Object.defineProperty(e, 'pointerType', { value: 'touch' });
      el.dispatchEvent(e);
    };
    const x0 = r.right - 20;
    fire('pointerdown', x0);
    for (let k = 1; k <= 8; k++) {
      fire('pointermove', x0 - k * 24);
      await new Promise((res) => setTimeout(res, 30));
    }
    fire('pointerup', x0 - 192);
  }, selector);

// --- données fictives ---
await page.goto(BASE);
await pause(1500);
const seed = buildSeed(year);
await page.evaluate(async (data) => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('cavavin', 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const kinds = Object.keys(data);
  const tx = db.transaction([...kinds, 'meta'], 'readwrite');
  for (const k of kinds) { tx.objectStore(k).clear(); for (const e of data[k]) tx.objectStore(k).put(e); }
  tx.objectStore('meta').put(true, 'sheet_ready');
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  localStorage.clear();
  localStorage.setItem('cavavin.claude.projectUrl', JSON.stringify('https://claude.ai/project/demo'));
  db.close();
}, seed);
await page.goto(`${BASE}#/cave`);
await page.reload();
await page.waitForSelector('.rack, .shelf', { timeout: 15000 });
await pause(1200);

// 1. Cave
await shot('cave');
// 2. Légende des couleurs
await page.click('button[aria-label="Légende des couleurs"]');
await shot('legende');
await page.keyboard.press('Escape');
await pause(500);
// 3. Quoi boire ?
await page.click('.cave-actions__dish');
await page.fill('#dish-input', 'risotto aux champignons');
await shot('quoi-boire');
await page.keyboard.press('Enter');
await page.waitForSelector('.wine-card');
await shot('liste-plat');
// 4. Liste + glisser
await page.evaluate(() => localStorage.removeItem('cavavin.list.filters'));
await go('#/liste');
await page.reload();
await page.waitForSelector('.swipe__front');
await pause(1000);
await shot('liste');
await swipeLeft('.swipe__front');
await shot('liste-swipe');
// 5. Fiche
await go('#/vin/w2?from=%2Fliste');
await shot('fiche');
await page.evaluate(() => document.querySelector('[aria-label="Style"]')?.scrollIntoView({ block: 'start' }));
await shot('fiche-style');
await page.evaluate(() => document.querySelector('[aria-label="Emplacements"]')?.scrollIntoView({ block: 'start' }));
await shot('fiche-ou-la-trouver');
// 6. Étagère + case
await go('#/etagere/l0');
await page.waitForSelector('.sv');
// On touche le coin vide de la case (pas une bouteille : un toucher sur une bouteille ouvre sa fiche).
const box = await page.locator('[data-zone="milieu-gauche"] rect.sv__zone').boundingBox();
await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8);
await pause(400);
await shot('etagere-case');
// 7. Stats
await go('#/stats');
await page.waitForSelector('.tbd__list, .tbd__summary', { timeout: 10000 }).catch(() => {});
await shot('stats');
// 8. Lien de Claude → formulaire pré-rempli
await go('#/ajouter/saisie?domain=Domaine%20Gramenon&cuvee=La%20M%C3%A9m%C3%A9&vintage=2020&appellation=C%C3%B4tes-du-Rh%C3%B4ne&region=Rh%C3%B4ne&country=France&color=rouge&tannin=3&drink_from=2023&drink_until=2029&pairings=curry%20de%20l%C3%A9gumes%3B%20gratin%20dauphinois%3B%20fromages%20%C3%A0%20p%C3%A2te%20dure');
await page.waitForSelector('#f-domain');
await shot('ajout-lien');
// 9. Historique + glisser
await go('#/historique');
await page.waitForSelector('.swipe__front');
await swipeLeft('.swipe__front');
await shot('historique-swipe');

await context.close(); // finalise la vidéo
await browser.close();
const vid = readdirSync(VIDEO_DIR).find((f) => f.endsWith('.webm'));
if (vid) renameSync(`${VIDEO_DIR}/${vid}`, `${VIDEO_DIR}/teaser.webm`);
console.log('Vidéo :', `${VIDEO_DIR}/teaser.webm`);
stop();
