import { llms, loader } from "fumadocs-core/source";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

import { blogSchema } from "./blog/schema";
import { docsIcon } from "./docs-icons";
import { docsRoute } from "./shared";
import { absolute } from "./site";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    async: true,
    // Git history gives each page a modified date for SEO and the sitemap.
    lastModified: true,
    // Processed Markdown backs the `.md` routes, llms.txt and the copy-as-Markdown button.
    postprocess: { includeProcessedMarkdown: true },
    schema: pageSchema.extend({
      /** Extra search keywords for this page. */
      keywords: z.array(z.string()).optional(),
      /** First publication date, `YYYY-MM-DD`. */
      published: z.iso.date().optional(),
      /** Author shown in article metadata; defaults to the organisation. */
      author: z.string().optional(),
    }),
  },
});

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  icon: docsIcon,
});

/** Plain-Markdown views of the docs for agents: llms.txt, llms-full.txt and `.md` pages. */
export const docsLlms = llms(source, {
  renderPage: async (page) => {
    const body = await page.data.getText("processed");

    return [
      `# ${page.data.title}`,
      `> For the complete documentation index, see [llms.txt](${absolute("/llms.txt")}).`,
      page.data.description,
      `Source: ${absolute(page.url)}`,
      body,
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});

/** Terms and privacy pages. A separate collection, so they stay out of the docs sidebar. */
export const legal = defineDocs({
  dir: "content/legal",
  docs: {
    async: true,
    schema: pageSchema.extend({
      /** Date of the last change, `YYYY-MM-DD`. */
      updated: z.iso.date(),
    }),
  },
});

export const legalSource = loader({
  source: legal.toFumadocsSource(),
  baseUrl: "/legal",
});

/** Blog posts, one MDX file per post in `content/blog`. The file name is the slug. */
export const blog = defineDocs({
  dir: "content/blog",
  docs: {
    async: true,
    // Backs the `.md` routes, llms.txt, the feed and the reading time.
    postprocess: { includeProcessedMarkdown: true },
    schema: blogSchema,
  },
});

export const blogSource = loader({
  source: blog.toFumadocsSource(),
  baseUrl: "/blog",
});
