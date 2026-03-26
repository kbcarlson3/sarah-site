import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/products' }),
  schema: z.object({
    title: z.string(),
    image: z.string(),
    link: z.string().url(),
    date: z.coerce.date(),
    sortOrder: z.number().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { products };
