import { createFileRoute } from "@tanstack/react-router";

import { textHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { blogLlmsSection } from "@/lib/blog/markdown";
import { getPackage } from "@/lib/packages";
import { getPageMarkdownUrl } from "@/lib/shared";
import { absolute, site } from "@/lib/site";
import { source } from "@/lib/source";

const agentInstructions = `## Instructions for agents

- Use \`@ensforge/sdk\`. Create one client and reuse it: \`Ensforge.create({ publicClient }).extend(ensActions())\`, where \`publicClient\` is a viem public client.
- Call actions as \`await ens.record.getAddress({ name: "nick.eth" })\`. Prefer this Promise API; the Effect API (\`@ensforge/sdk/effect\`) is for code that already uses Effect.
- Names are normalised and validated for you. Do not call \`normalize\` before passing a name.
- Reads return \`null\` for a missing record. Failures reject with an error that has a \`code\` and a \`docsUrl\`; fetch the \`docsUrl\` for the cause and the fix.
- Writes need a wallet client on the client. Preview a write with the plan actions before sending it.
- Each docs page is also served as Markdown: append \`.md\` to its URL.`;

/** Pages an agent should read first, in order, as docs slugs. */
const corePages = [
  ["sdk"],
  ["sdk", "installation"],
  ["sdk", "create-a-client"],
  ["sdk", "ways-to-call-actions"],
  ["sdk", "get-an-address"],
  ["sdk", "get-text-records"],
  ["sdk", "look-up-many-at-once"],
  ["sdk", "register-a-name"],
  ["sdk", "set-records"],
  ["sdk", "handle-errors"],
  ["sdk", "effect-api"],
  ["sdk", "use-with-ai-agents"],
  ["react"],
  ["react", "set-up-the-provider"],
  ["contracts"],
  ["hca"],
] as const;

const pageLine = (page: {
  url: string;
  slugs: string[];
  data: { title: string; description?: string | undefined };
}) =>
  `- [${page.data.title}](${absolute(getPageMarkdownUrl(page))}): ${page.data.description ?? ""}`.trimEnd();

/** The core pages first; every other docs page goes under Optional, grouped by package. */
function docsIndex() {
  const core = corePages.flatMap((slugs) => {
    const page = source.getPage([...slugs]);
    return page ? [page] : [];
  });
  const coreUrls = new Set(core.map((page) => page.url));
  const groups = new Map<string, string[]>();

  for (const page of source.getPages()) {
    if (coreUrls.has(page.url)) continue;
    const pkg = page.slugs[0] ?? "docs";

    groups.set(pkg, [...(groups.get(pkg) ?? []), pageLine(page)]);
  }

  const optional = [...groups].map(
    ([slug, lines]) => `### ${getPackage(slug)?.npm ?? slug}\n\n${lines.join("\n")}`,
  );

  return [
    `## Core docs\n\n${core.map(pageLine).join("\n")}`,
    `## Optional\n\n${optional.join("\n\n")}`,
  ].join("\n\n");
}

/** The llms.txt index: what ensforge is, its pages, and every docs page. */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const body = [
          `# ${site.name}`,
          `> ${site.description}`,
          agentInstructions,
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
