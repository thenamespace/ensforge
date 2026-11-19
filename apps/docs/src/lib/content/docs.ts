import { pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

/**
 * The docs pages as a content collection. Browser code imports this module only, so the page
 * loaders, search and Markdown views in `@/lib/source` stay on the server.
 */
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
