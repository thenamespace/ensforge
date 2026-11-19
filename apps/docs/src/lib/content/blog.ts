import { defineDocs } from "fumadocs-mdx/macro";

import { blogSchema } from "@/lib/blog/schema";

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
