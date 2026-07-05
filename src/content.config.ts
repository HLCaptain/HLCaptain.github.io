import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const sharedFields = {
  title: z.string(),
  description: z.string(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
  accent: z.string().optional()
};

const articles = defineCollection({
  loader: glob({ base: "./src/content/articles", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    ...sharedFields,
    readingTime: z.string().optional()
  })
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    ...sharedFields,
    status: z.enum(["active", "shipped", "exploratory"]).default("active"),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.url()
        })
      )
      .default([])
  })
});

export const collections = { articles, projects };
