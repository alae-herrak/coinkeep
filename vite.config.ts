import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo-name>/. The deploy workflow sets
// BASE_PATH accordingly; locally (and for Netlify Drop) the app lives at "/".
const base = process.env.BASE_PATH ?? '/';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const BACKGROUND = '#f6f7f9';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before activating a new version ("New version — Reload"), never reload under the user.
      registerType: 'prompt',
      // Registered from React (src/components/pwa/UpdatePrompt.tsx) so we can show the prompt.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: base,
        name: 'Coinkeep',
        short_name: 'Coinkeep',
        description: 'A calm, private money tracker in Moroccan dirhams. Your data stays on your phone.',
        lang: 'en',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: BACKGROUND,
        background_color: BACKGROUND,
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the home-screen icon on Android to jump straight into these flows.
        shortcuts: [
          {
            name: 'Add expense',
            short_name: 'Add expense',
            url: `${base}#/add/expense`,
            icons: [{ src: 'shortcut-expense-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Log paycheck',
            short_name: 'Log paycheck',
            url: `${base}#/paycheck`,
            icons: [{ src: 'shortcut-paycheck-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Precache the whole app shell, including the lazily loaded Insights chunk, for full offline use.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
