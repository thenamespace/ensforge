import { renderToStaticMarkup } from "react-dom/server";

import { Markdown } from "fumadocs-core/content/md";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";

import { absolute, site } from "@/lib/site";

import { blogDescription, categoryLabels } from "./format";
import { blogPages, summarizePost } from "./posts";

// Server only: imported dynamically from the feed route.

const FEED_SIZE = 20;

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Feed readers resolve links against the feed, not the site, so make site paths absolute. */
const absoluteLinks = (markup: string) =>
  markup.replaceAll(/(href|src)="\/(?!\/)/g, `$1="${site.url}/`);

/**
 * Processed Markdown keeps Fumadocs' heading ids (`## Title [#id]`) and `package-install`
 * blocks, which feed readers would show verbatim.
 */
const forFeeds = (markdown: string) =>
  markdown
    .replaceAll(/^(#{1,6} .*?) \[#[^\]]+\]$/gm, "$1")
    .replaceAll(/```package-install\n([^\n]+)\n```/g, "```sh\nnpm install $1\n```");

async function html(markdown: string) {
  const tree = await Markdown({
    children: forFeeds(markdown),
    async: true,
    remarkPlugins: [remarkGfm],
  });

  return absoluteLinks(renderToStaticMarkup(tree));
}

const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

/** RSS 2.0 with the full post as `content:encoded`, newest first. */
export async function blogFeed() {
  const pages = blogPages().slice(0, FEED_SIZE);

  const items = await Promise.all(
    pages.map(async (page) => {
      const post = await summarizePost(page);
      const url = absolute(post.url);
      const content = await html(await page.data.getText("processed"));

      return `    <item>
      <title>${escape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escape(post.description)}</description>
      <pubDate>${rfc822(post.published)}</pubDate>
      <dc:creator>${escape(post.authors.map((author) => author.name).join(", ") || site.publisher)}</dc:creator>
      <category>${escape(categoryLabels[post.category].one)}</category>
${post.tags.map((tag) => `      <category>${escape(tag)}</category>`).join("\n")}
      <content:encoded><![CDATA[${content.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    }),
  );

  const updated = pages[0]?.data.updated ?? pages[0]?.data.published;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escape(site.name)} blog</title>
    <link>${absolute("/blog")}</link>
    <atom:link href="${absolute("/blog/rss.xml")}" rel="self" type="application/rss+xml" />
    <description>${escape(blogDescription)}</description>
    <language>en</language>
    <dc:creator>${escape(site.publisher)}</dc:creator>
    <image>
      <url>${absolute("/logo.svg")}</url>
      <title>${escape(site.name)} blog</title>
      <link>${absolute("/blog")}</link>
    </image>${updated ? `\n    <lastBuildDate>${rfc822(updated)}</lastBuildDate>` : ""}
${items.join("\n")}
  </channel>
</rss>
`;
}
