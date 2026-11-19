import { llms, loader } from "fumadocs-core/source";

import { blog } from "./content/blog";
import { docs } from "./content/docs";
import { legal } from "./content/legal";
import { docsIcon } from "./docs-icons";
import { docsRoute } from "./shared";
import { absolute } from "./site";

/**
 * Page loaders over the content collections: the page tree, search, Markdown views and sitemap.
 * Server code only; browser code imports the collections from `@/lib/content/*`.
 */
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

export const legalSource = loader({
  source: legal.toFumadocsSource(),
  baseUrl: "/legal",
});

export const blogSource = loader({
  source: blog.toFumadocsSource(),
  baseUrl: "/blog",
});
