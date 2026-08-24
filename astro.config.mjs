// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

/*
 * SITE_URL y BASE_PATH los inyecta el workflow de GitHub Actions.
 *
 *  - Página de proyecto  →  SITE_URL=https://felipe112.github.io  BASE_PATH=/payment-plan
 *  - Dominio propio      →  SITE_URL=https://plan.cacharreo.dev   BASE_PATH=/
 *
 * En local, sin variables, se construye en la raíz para que `pnpm preview`
 * sirva en http://localhost:4321/ sin subruta.
 */
const site = process.env.SITE_URL ?? 'https://felipe112.github.io';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [react()],
  vite: {
    optimizeDeps: {
      include: ['exceljs/dist/exceljs.min.js'],
    },
  },
});
