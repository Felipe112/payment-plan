// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  site: 'https://plan-de-pagos.local',
  vite: {
    optimizeDeps: {
      include: ['exceljs/dist/exceljs.min.js'],
    },
  },
});
