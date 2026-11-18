import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { blogImageUrl } from "@/lib/og/urls";

import { blogPages, getBlogPage, listPosts, postImage, relatedPages, summarizePost } from "./posts";
import { isBlogTag } from "./schema";

export const loadBlogIndex = createServerFn({ method: "GET" }).handler(async () => ({
  posts: await listPosts(),
}));

export const loadBlogTag = createServerFn({ method: "GET" })
  .validator((tag: string) => tag)
  .handler(async ({ data: tag }) => {
    if (!isBlogTag(tag)) throw notFound();

    const posts = (await listPosts()).filter((post) => post.tags.includes(tag));
    if (posts.length === 0) throw notFound();

    return { tag, posts };
  });

export const loadBlogPost = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const page = getBlogPage(slug);
    if (!page) throw notFound();

    const pages = blogPages();
    const index = pages.findIndex((other) => other.path === page.path);
    const newer = pages[index - 1];
    const older = pages[index + 1];

    const series = page.data.series;
    const seriesPosts = series
      ? pages
          .filter((other) => other.data.series?.id === series.id)
          .toSorted((a, b) => (a.data.series?.order ?? 0) - (b.data.series?.order ?? 0))
      : [];

    return {
      path: page.path,
      post: await summarizePost(page),
      image: postImage(page, blogImageUrl(slug)),
      seo: page.data.seo ?? {},
      newer: newer ? await summarizePost(newer) : undefined,
      older: older ? await summarizePost(older) : undefined,
      related: await Promise.all(relatedPages(page, pages).map(summarizePost)),
      series: series
        ? {
            id: series.id,
            order: series.order,
            posts: await Promise.all(seriesPosts.map(summarizePost)),
          }
        : undefined,
    };
  });

export type BlogPostData = Awaited<ReturnType<typeof loadBlogPost>>;
