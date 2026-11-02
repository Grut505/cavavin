import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/sw-config';

// Pour GitHub Pages (https://<compte>.github.io/cavavin/) : VITE_BASE=/cavavin/
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    VitePWA(pwaOptions),
  ],
});
