import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    readTime: z.number().default(5),
    author: z.string().default('צוות NINJA'),
    cover: z.string().optional(),
  }),
});

export const collections = { blog };
