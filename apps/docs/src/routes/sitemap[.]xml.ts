import { createFileRoute } from "@tanstack/react-router";

import { listPosts } from "@/lib/blog/posts";
import { blogImageUrl, docsImageUrl, type SitePage, siteImageUrl } from "@/lib/og/urls";
import { absolute } from "@/lib/site";
import { source } from "@/lib/source";

interface Entry {
  readonly path: string;
  readonly image: string;
  readonly priority: string;
  readonly changefreq: "weekly" | "monthly";
  readonly lastmod?: string;
}

const landing: readonly { path: string; page: SitePage; priority: string }[] = [
  { path: "/", page: "home", priority: "1.0" },
  { path: "/blog", page: "blog", priority: "0.7" },
  { path: "/terms", page: "home", priority: "0.3" },
  { path: "/privacy", page: "home", priority: "0.3" },
];

const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function entries(): Promise<Entry[]> {
  const docs = await Promise.all(
    source.getPages().map(async (page): Promise<Entry> => {
      const { lastModified } = await page.data.load();
      const entry: Entry = {
        path: page.url,
        image: docsImageUrl(page.slugs),
        priority: page.slugs.length <= 1 ? "0.8" : "0.6",
        changefreq: "weekly",
      };

      return lastModified ? Object.assign(entry, { lastmod: lastModified.toISOString() }) : entry;
    }),
  );

  const posts = await listPosts();
  const blog: Entry[] = posts.map((post) => ({
    path: post.url,
    image: post.cover?.url ?? blogImageUrl(post.slug),
    priority: "0.7",
    changefreq: "monthly",
    lastmod: new Date(`${post.updated ?? post.published}T00:00:00Z`).toISOString(),
  }));
  const tags = [...new Set(posts.flatMap((post) => post.tags))].map((tag): Entry => ({
    path: `/blog/tags/${tag}`,
    image: siteImageUrl("blog"),
    priority: "0.4",
    changefreq: "weekly",
  }));

  return [
    ...landing.map((entry) => ({
      path: entry.path,
      image: siteImageUrl(entry.page),
      priority: entry.priority,
      changefreq: "monthly" as const,
    })),
    ...docs,
    ...blog,
    ...tags,
  ];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = (await entries())
          .map(
            (entry) => `  <url>
    <loc>${escape(absolute(entry.path))}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ""}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
    <image:image><image:loc>${escape(entry.image)}</image:loc></image:image>
  </url>`,
          )
          .join("\n");

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
