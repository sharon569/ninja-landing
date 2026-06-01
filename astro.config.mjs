// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// Hybrid mode: by default pages are SSR (needed for /portal auth-protected routes).
// Existing static pages opt back into static via `export const prerender = true;`
// in their frontmatter — see src/pages/index.astro etc.
export default defineConfig({
  output: 'server',
  adapter: vercel({
    maxDuration: 60,
  }),
  site: 'https://www.samp.ninja',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/portal/') && !page.includes('/proposal/') && !page.includes('/brief/'),
      i18n: { defaultLocale: 'he', locales: { he: 'he-IL' } },
      serialize(item) {
        const url = item.url;
        if (url === 'https://www.samp.ninja/') {
          item.changefreq = 'weekly';
          item.priority = 1.0;
        } else if (url.match(/\/services\/?$/) || url.match(/\/work\/?$/) || url.match(/\/contact\/?$/)) {
          item.changefreq = 'weekly';
          item.priority = 0.9;
        } else if (url.includes('/services/')) {
          item.changefreq = 'monthly';
          item.priority = 0.8;
        } else if (url.includes('/work/')) {
          item.changefreq = 'monthly';
          item.priority = 0.7;
        } else if (url.includes('/blog/')) {
          item.changefreq = 'monthly';
          item.priority = 0.6;
        } else {
          item.changefreq = 'monthly';
          item.priority = 0.5;
        }
        return item;
      },
    }),
  ],
});
