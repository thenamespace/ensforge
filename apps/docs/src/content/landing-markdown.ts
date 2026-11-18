import { absolute, site } from "@/lib/site";

/**
 * The landing pages as Markdown for agents, served at `/index.md` and through content
 * negotiation. Keep them in step with the pages themselves.
 */

export type LandingPage = "index";

const directive = `> For the complete documentation index, see [llms.txt](${absolute("/llms.txt")}).`;

const pages: Record<LandingPage, () => string> = {
  index: () => `# ${site.name}

${directive}

${site.description}

Placeholder: the landing page is not written yet.

## Packages

- \`@ensforge/sdk\`: Docs: ${absolute("/docs/sdk.md")}
- \`@ensforge/contracts\`: Docs: ${absolute("/docs/contracts.md")}
- \`@ensforge/react\`: Docs: ${absolute("/docs/react.md")}
- \`@ensforge/hca\`: Docs: ${absolute("/docs/hca.md")}

Source: ${site.github}
`,
};

export const landingPaths: Record<string, LandingPage> = {
  "/": "index",
};

export const isLandingPage = (page: string): page is LandingPage => Object.hasOwn(pages, page);

export const landingMarkdown = (page: LandingPage) => pages[page]();
