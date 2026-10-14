import { defineConfig } from 'vitest/config';

/**
 * Eigene Vitest-Konfiguration (ohne das Needle-Vite-Plugin aus vite.config.js):
 * Pure-Logic-Tests brauchen keinen Engine-Build-Schritt, und das Plugin hält
 * sonst den Vite-Server nach Testende offen (Prozess beendet sich nicht sauber).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
