import { absolute } from "@/lib/site";

/** OG image for a docs page: `/og/docs/<slugs>/image.webp`. */
export const docsImagePath = (slugs: readonly string[]) =>
  `/og/docs/${[...slugs, "image.webp"].join("/")}`;

export type SitePage = "home" | "blog";

/** OG image for a landing page: `/og/<page>.webp`. */
export const siteImagePath = (page: SitePage) => `/og/${page}.webp`;

export const docsImageUrl = (slugs: readonly string[]) => absolute(docsImagePath(slugs));
export const siteImageUrl = (page: SitePage) => absolute(siteImagePath(page));

/** OG image for a blog post: `/og/blog/<slug>.webp`. */
export const blogImagePath = (slug: string) => `/og/blog/${slug}.webp`;
export const blogImageUrl = (slug: string) => absolute(blogImagePath(slug));
