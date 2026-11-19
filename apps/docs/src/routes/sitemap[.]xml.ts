import { createFileRoute } from "@tanstack/react-router";

import { listPosts } from "@/lib/blog/posts";
import { blogImageUrl, docsImageUrl, type SitePage, siteImageUrl } from "@/lib/og/urls";
import { documentedPackages } from "@/lib/packages";
import { absolute, site } from "@/lib/site";
import { legalSource, source } from "@/lib/source";

interface Entry {
  readonly path: string;
  readonly image: string;
  readonly priority: string;
  readonly changefreq: "weekly" | "monthly";
  readonly lastmod?: string;
}

const landing: readonly { path: string; page: SitePage; priority: string; legal?: string }[] = [
  { path: "/", page: "home", priority: "1.0" },
  { path: "/terms", page: "home", priority: "0.3", legal: "terms" },
  { path: "/privacy", page: "home", priority: "0.3", legal: "privacy" },
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

  const posts = site.blogEnabled ? await listPosts() : [];
  const blogIndex: readonly Entry[] = site.blogEnabled
    ? [{ path: "/blog", image: siteImageUrl("blog"), priority: "0.7", changefreq: "weekly" }]
    : [];
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

  // Changelogs render GitHub releases at request time, so they have no lastmod of their own.
  const changelogs = documentedPackages.map((pkg): Entry => ({
    path: `/docs/${pkg.slug}/changelog`,
    image: docsImageUrl([pkg.slug]),
    priority: "0.4",
    changefreq: "weekly",
  }));

  return [
    ...landing.map((entry): Entry => {
      const updated = entry.legal ? legalSource.getPage([entry.legal])?.data.updated : undefined;

      const page: Entry = {
        path: entry.path,
        image: siteImageUrl(entry.page),
        priority: entry.priority,
        changefreq: "monthly",
      };

      return updated
        ? Object.assign(page, { lastmod: new Date(`${updated}T00:00:00Z`).toISOString() })
        : page;
    }),
    ...docs,
    ...changelogs,
    ...blogIndex,
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
