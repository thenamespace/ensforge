import { pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";

import { type AuthorId, authors } from "./authors";

/** A key on the CDN, e.g. `blog/<slug>/cover.webp`: no leading slash, no host. */
export const cdnKey = z
  .string()
  .regex(
    /^(?!\/)(?!https?:)[\w\-./]+\.(png|jpe?g|webp|avif|gif|svg)$/,
    "Use a CDN key like blog/<slug>/cover.webp, not a URL or an absolute path.",
  );

/** Sizes are required so images reserve their space and feed `og:image:width`/`height`. */
export const blogImage = z.object({
  src: cdnKey,
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/** A closed list, so tag pages stay meaningful. Add a tag here before using it in a post. */
export const blogTags = [
  "release",
  "sdk",
  "contracts",
  "react",
  "hca",
  "ens",
  "effect",
  "guide",
  "engineering",
  "community",
] as const;

export const blogCategories = ["announcement", "release", "guide", "engineering"] as const;

export const blogPackages = ["sdk", "contracts", "react", "hca"] as const;

export type BlogTag = (typeof blogTags)[number];

export const isBlogTag = (tag: string): tag is BlogTag =>
  (blogTags as readonly string[]).includes(tag);
export type BlogCategory = (typeof blogCategories)[number];
export type BlogPackage = (typeof blogPackages)[number];

export const blogSchema = pageSchema.extend({
  title: z.string().min(1).max(90),
  /** Meta description and the summary on cards. */
  description: z.string().min(50).max(160),

  /** `YYYY-MM-DD`. `updated` drives `article:modified_time` and the "Updated" label. */
  published: z.iso.date(),
  updated: z.iso.date().optional(),
  /** Drafts render in development only: no listing, feed, sitemap or route in production. */
  draft: z.boolean().default(false),

  /** Keys of `authors` in `src/lib/blog/authors.ts`; an unknown key fails the build. */
  authors: z
    .array(
      z.custom<AuthorId>((id) => typeof id === "string" && Object.hasOwn(authors, id), {
        error: "Unknown author: add it to src/lib/blog/authors.ts first.",
      }),
    )
    .min(1),
  category: z.enum(blogCategories),
  tags: z.array(z.enum(blogTags)).max(5).default([]),
  /** Gives the post its package accent and links it to that package's docs. */
  package: z.enum(blogPackages).optional(),

  /** Header image and card thumbnail. Without one, the post gets a drawn cover. */
  cover: blogImage.optional(),
  /** 1200 × 630 override. Without one, the OG image is generated. */
  og: blogImage.optional(),

  seo: z
    .object({
      /** For a `<title>` when the headline is too long for search results. */
      title: z.string().max(60).optional(),
      description: z.string().max(160).optional(),
      /** For posts first published elsewhere. */
      canonical: z.url().optional(),
      noindex: z.boolean().optional(),
      keywords: z.array(z.string()).max(10).optional(),
    })
    .optional(),

  /** Release posts link to their GitHub release. */
  release: z
    .object({
      version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
      url: z.url().optional(),
    })
    .optional(),

  featured: z.boolean().default(false),
  series: z.object({ id: z.string(), order: z.number().int().positive() }).optional(),
  /** Slugs of other posts to suggest at the end. Falls back to shared tags. */
  related: z.array(z.string()).max(3).optional(),
});

export type BlogFrontmatter = z.infer<typeof blogSchema>;
