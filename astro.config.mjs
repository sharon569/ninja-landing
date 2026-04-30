// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// Hybrid mode: by default pages are SSR (needed for /portal auth-protected routes).
// Existing static pages opt back into static via `export const prerender = true;`
// in their frontmatter — see src/pages/index.astro etc.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://www.samp.ninja',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/portal/'),
    }),
  ],
});
