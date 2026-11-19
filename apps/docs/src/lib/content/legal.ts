import { pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

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
