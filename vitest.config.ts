import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environnement léger par défaut : la logique métier et la synchronisation n'ont pas besoin d'un
    // navigateur. Les tests d'interface activent jsdom avec `// @vitest-environment jsdom` en tête de fichier.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
