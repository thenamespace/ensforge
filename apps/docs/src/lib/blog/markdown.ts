import { absolute, site } from "@/lib/site";

import { blogDescription, categoryLabels, formatDate } from "./format";
import { blogPages, getBlogPage, listPosts } from "./posts";

/** Posts as Markdown for agents: `/blog.md`, `/blog/<slug>.md` and llms.txt. */

const directive = `> For the complete documentation index, see [llms.txt](${absolute("/llms.txt")}).`;

export async function blogIndexMarkdown() {
  const posts = await listPosts();

  return [
    `# ${site.name} blog`,
    directive,
    `${blogDescription} Newest first.`,
    posts
      .map(
        (post) =>
          `- [${post.title}](${absolute(`${post.url}.md`)}): ${categoryLabels[post.category].one}, ${formatDate(post.published)}. ${post.description}`,
      )
      .join("\n"),
    `Feed: ${absolute("/blog/rss.xml")}`,
  ].join("\n\n");
}

export async function postMarkdown(slug: string): Promise<string | undefined> {
  const page = getBlogPage(slug);
  if (!page) return undefined;

  const { data } = page;
  const body = await data.getText("processed");

  return [
    `# ${data.title}`,
    directive,
    data.description,
    [
      `Published ${formatDate(data.published)}${data.updated ? `, updated ${formatDate(data.updated)}` : ""}.`,
      `Category: ${categoryLabels[data.category].one}.`,
      data.tags.length > 0 ? `Tags: ${data.tags.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    `Source: ${absolute(page.url)}`,
    body,
  ].join("\n\n");
}

/** Blog lines for llms.txt. */
export function blogLlmsSection() {
  const lines = blogPages().map(
    (page) => `- [${page.data.title}](${absolute(`${page.url}.md`)}): ${page.data.description}`,
  );

  return lines.length > 0 ? `## Blog\n\n${lines.join("\n")}` : "";
}
