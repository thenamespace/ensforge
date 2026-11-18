import { cdn } from "@/lib/cdn";
import { blogSource } from "@/lib/source";

import { getAuthor } from "./authors";
import type { BlogCategory, BlogPackage, BlogTag } from "./schema";

/*
 * Blog posts as plain, serialisable data for loaders, feeds, the sitemap and OG images. Runs
 * on the server (or at prerender time), where the compiled pages are available.
 */

export interface PostImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface PostAuthor {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly url: string;
  readonly avatar?: string;
  readonly x?: string;
}

export interface PostSummary {
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly published: string;
  readonly updated?: string;
  readonly category: BlogCategory;
  readonly tags: readonly BlogTag[];
  readonly package?: BlogPackage;
  readonly authors: readonly PostAuthor[];
  readonly cover?: PostImage;
  readonly featured: boolean;
  readonly draft: boolean;
  readonly readingMinutes: number;
  readonly release?: { readonly version: string; readonly url?: string | undefined };
}

type BlogPage = ReturnType<typeof blogSource.getPages>[number];

const WORDS_PER_MINUTE = 230;

/** Drafts exist only in development, so a draft can never leak into a production listing. */
const isVisible = (page: BlogPage) => import.meta.env.DEV || !page.data.draft;

const image = (value: { src: string; alt: string; width: number; height: number }) => ({
  url: cdn(value.src),
  alt: value.alt,
  width: value.width,
  height: value.height,
});

function authorsOf(page: BlogPage): PostAuthor[] {
  return page.data.authors.map((id) => {
    const author = getAuthor(id);
    if (!author) throw new Error(`Unknown author "${id}" in ${page.path}`);

    return {
      id,
      name: author.name,
      role: author.role,
      url: author.url,
      ...(author.avatar ? { avatar: cdn(author.avatar) } : {}),
      ...(author.x ? { x: author.x } : {}),
    };
  });
}

const minutes = new Map<string, number>();

async function readingMinutes(page: BlogPage) {
  const cached = minutes.get(page.path);
  if (cached !== undefined) return cached;

  const text = await page.data.getText("processed");
  const words = text.split(/\s+/).filter(Boolean).length;
  const value = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  minutes.set(page.path, value);

  return value;
}

export const slugOf = (page: BlogPage) => page.slugs.join("/");

async function summarize(page: BlogPage): Promise<PostSummary> {
  const { data } = page;

  return {
    slug: slugOf(page),
    url: page.url,
    title: data.title,
    description: data.description,
    published: data.published,
    ...(data.updated ? { updated: data.updated } : {}),
    category: data.category,
    tags: data.tags,
    ...(data.package ? { package: data.package } : {}),
    authors: authorsOf(page),
    ...(data.cover ? { cover: image(data.cover) } : {}),
    featured: data.featured,
    draft: data.draft,
    readingMinutes: await readingMinutes(page),
    ...(data.release ? { release: data.release } : {}),
  };
}

/** Visible pages, newest first. */
export function blogPages(): BlogPage[] {
  return blogSource
    .getPages()
    .filter(isVisible)
    .toSorted((a, b) => b.data.published.localeCompare(a.data.published));
}

export function getBlogPage(slug: string): BlogPage | undefined {
  const page = blogSource.getPage([slug]);

  return page && isVisible(page) ? page : undefined;
}

export const listPosts = () => Promise.all(blogPages().map(summarize));

export const summarizePost = summarize;

/** The OG image for a post: its own override, or the generated one. */
export function postImage(page: BlogPage, generated: string): PostImage {
  if (page.data.og) return image(page.data.og);

  return { url: generated, alt: page.data.title, width: 1200, height: 630 };
}

/**
 * Up to three posts to read next: the ones the post names, then posts sharing the most tags,
 * then the newest.
 */
export function relatedPages(page: BlogPage, pages: readonly BlogPage[]): BlogPage[] {
  const others = pages.filter((other) => other.path !== page.path);
  const named = (page.data.related ?? []).flatMap((slug) => {
    const match = others.find((other) => slugOf(other) === slug);
    return match ? [match] : [];
  });

  const shared = (other: BlogPage) =>
    other.data.tags.filter((tag) => page.data.tags.includes(tag)).length;

  const rest = others
    .filter((other) => !named.includes(other))
    .toSorted((a, b) => shared(b) - shared(a));

  return [...named, ...rest].slice(0, 3);
}
