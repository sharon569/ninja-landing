// Markdown rendering for portal reports + strategy.
// Uses `marked` with conservative defaults — no GFM tables/heavy plugins.

import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(md: string): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}
