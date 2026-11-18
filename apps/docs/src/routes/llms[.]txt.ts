import { createFileRoute } from "@tanstack/react-router";

import { textHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { blogLlmsSection } from "@/lib/blog/markdown";
import { getPackage } from "@/lib/packages";
import { getPageMarkdownUrl } from "@/lib/shared";
import { absolute, site } from "@/lib/site";
import { source } from "@/lib/source";

/** Docs pages grouped by package, each linking to its Markdown version. */
function docsIndex() {
  const groups = new Map<string, string[]>();

  for (const page of source.getPages()) {
    const pkg = page.slugs[0] ?? "docs";
    const line = `- [${page.data.title}](${absolute(getPageMarkdownUrl(page))}): ${page.data.description ?? ""}`;

    groups.set(pkg, [...(groups.get(pkg) ?? []), line.trimEnd()]);
  }

  return [...groups]
    .map(([slug, lines]) => `## ${getPackage(slug)?.npm ?? slug} docs\n\n${lines.join("\n")}`)
    .join("\n\n");
}

/** The llms.txt index: what ensforge is, its pages, and every docs page. */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const body = [
          `# ${site.name}`,
          `> ${site.description}`,
          "## Pages",
          [
            `- [Home](${absolute("/index.md")}): what ${site.name} is.`,
            `- [Blog](${absolute("/blog.md")}): release notes and guides.`,
            `- [Full docs as one file](${absolute("/llms-full.txt")})`,
          ].join("\n"),
          docsIndex(),
          blogLlmsSection(),
        ]
          .filter(Boolean)
          .join("\n\n");

        await countAgentRead(request, "llms");

        return new Response(body, { headers: textHeaders });
      },
    },
  },
});
