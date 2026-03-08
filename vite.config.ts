import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vyayamy',
        short_name: 'Vyayamy',
        description: 'A minimal training journal.',
        theme_color: '#FAFAF9',
        background_color: '#FAFAF9',
        display: 'standalone',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        sourcemap: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
