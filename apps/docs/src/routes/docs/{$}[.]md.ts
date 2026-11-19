import { createFileRoute } from "@tanstack/react-router";

import { markdownHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { getChangelogPackage } from "@/lib/packages";
import { movedReference } from "@/lib/reference-redirects";
import { docsLlms, source } from "@/lib/source";

/** A docs page as Markdown: `/docs/sdk.md`, `/docs/sdk/changelog.md`, `/docs/index.md` for the root. */
export const Route = createFileRoute("/docs/{$}.md")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slugs = (params._splat ?? "").split("/").filter(Boolean);
        const moved = movedReference(slugs);

        if (moved) {
          return new Response(null, {
            status: 301,
            headers: { location: `/docs/${moved.join("/")}.md` },
          });
        }

        const changelog = getChangelogPackage(slugs);

        if (changelog) {
          await countAgentRead(request, "md");
          const { changelogMarkdown } = await import("@/lib/changelog.server");
          return new Response(await changelogMarkdown(changelog), { headers: markdownHeaders });
        }

        const page = source.getPage(slugs[0] === "index" && slugs.length === 1 ? [] : slugs);

        if (!page) return new Response("Not found", { status: 404 });

        await countAgentRead(request, "md");

        return new Response(await docsLlms.page(page), { headers: markdownHeaders });
      },
    },
  },
});
