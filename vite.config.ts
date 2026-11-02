import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/sw-config';

// Pour GitHub Pages (https://<compte>.github.io/cavavin/) : VITE_BASE=/cavavin/
const base = process.env.VITE_BASE ?? './';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

/** Identifiant court du commit construit : variable GitHub Actions, sinon git, sinon « local ». */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

/**
 * En développement, la version est lue au démarrage du serveur : on le redémarre quand `package.json`
 * (numéro) ou l'historique git (commit) change, pour que Réglages → Version reste juste.
 */
function restartOnVersionChange(): Plugin {
  return {
    name: 'cavavin-restart-on-version-change',
    apply: 'serve',
    configureServer(server) {
      const watched = [resolve('package.json'), resolve('.git/logs/HEAD')];
      server.watcher.add(watched);
      server.watcher.on('change', (file) => {
        if (watched.includes(file)) void server.restart();
      });
    },
  };
}

export default defineConfig({
  base,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  // Version affichée dans Réglages : numéro (package.json), commit et date de construction.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [VitePWA(pwaOptions), restartOnVersionChange()],
});
