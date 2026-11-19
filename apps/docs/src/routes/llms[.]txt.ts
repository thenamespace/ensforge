import { createFileRoute } from "@tanstack/react-router";

import { textHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { blogLlmsSection } from "@/lib/blog/markdown";
import { getPackage } from "@/lib/packages";
import { getPageMarkdownUrl } from "@/lib/shared";
import { absolute, site } from "@/lib/site";
import { source } from "@/lib/source";

const agentInstructions = `## Instructions for agents

- Use \`@ensforge/sdk\`. Create one client and reuse it: \`Ensforge.create({ chain: mainnet }).extend(ensActions())\`, with \`transports\` for your own RPCs.
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

/**
 * Reference pages llms.txt lists: package and domain or class pages, and the few topical pages
 * (client, utilities, indexers, executors, components, contracts tables). `docs lint` budgets the
 * same set.
 */
function isReferenceIndex(slugs: readonly string[], path: string): boolean {
  const [, pkg, page] = slugs;
  if (page === undefined || path.endsWith("index.mdx")) return true;
  if (pkg === "contracts") return true;
  // Error class pages are kebab-case; codes are upper case.
  if (pkg === "errors") return page === page.toLowerCase();
  if (pkg === "react") return !page.startsWith("use");
  if (pkg === "sdk" || pkg === "hca") return slugs.length === 3;
  return false;
}

/**
 * The core pages first, then the hand-written reference pages. Every other docs page goes under
 * Optional: package guides by package, and the API reference (`reference/<package>`) under its own
 * heading with errors last.
 */
function docsIndex() {
  const core = corePages.flatMap((slugs) => {
    const page = source.getPage([...slugs]);
    return page ? [page] : [];
  });
  const coreUrls = new Set(core.map((page) => page.url));
  const groups = new Map<string, string[]>();
  const reference = new Map<string, string[]>();
  const referenceRoot: string[] = [];

  for (const page of source.getPages()) {
    if (coreUrls.has(page.url)) continue;
    const [first, second] = page.slugs;

    if (first !== "reference") {
      const pkg = first ?? "docs";
      groups.set(pkg, [...(groups.get(pkg) ?? []), pageLine(page)]);
    } else if (second === undefined) {
      referenceRoot.push(pageLine(page));
    } else if (second === "errors" || getPackage(second)) {
      // Individual actions, hooks and error codes are reachable from these index pages and their
      // .md versions; listing them would push llms.txt far past what an agent reads at once.
      if (!isReferenceIndex(page.slugs, page.path)) continue;
      reference.set(second, [...(reference.get(second) ?? []), pageLine(page)]);
    } else {
      core.push(page);
    }
  }

  const optional = [...groups].map(
    ([slug, lines]) => `### ${getPackage(slug)?.npm ?? slug}\n\n${lines.join("\n")}`,
  );
  const referenceGroups = [...reference]
    .toSorted(([a], [b]) => Number(a === "errors") - Number(b === "errors"))
    .map(
      ([slug, lines]) =>
        `#### ${slug === "errors" ? "Errors" : (getPackage(slug)?.npm ?? slug)}\n\n${lines.join("\n")}`,
    );
  const apiReference = [...referenceRoot, ...referenceGroups].join("\n\n");

  return [
    `## Core docs\n\n${core.map(pageLine).join("\n")}`,
    `## Optional\n\n${[...optional, `### API reference\n\n${apiReference}`].join("\n\n")}`,
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
            ...(site.blogEnabled
              ? [`- [Blog](${absolute("/blog.md")}): release notes and guides.`]
              : []),
            `- [Full docs as one file](${absolute("/llms-full.txt")})`,
          ].join("\n"),
          docsIndex(),
          site.blogEnabled ? blogLlmsSection() : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        await countAgentRead(request, "llms");

        return new Response(body, { headers: textHeaders });
      },
    },
  },
});
