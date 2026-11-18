import { createFileRoute } from "@tanstack/react-router";

import { isLandingPage, landingMarkdown } from "@/content/landing-markdown";
import { markdownHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { blogIndexMarkdown } from "@/lib/blog/markdown";
import { site } from "@/lib/site";

/** The landing pages and the blog index as Markdown: `/index.md`, `/blog.md`. */
export const Route = createFileRoute("/{$}.md")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const page = params._splat ?? "";

        if (page === "blog" && site.blogEnabled) {
          await countAgentRead(request, "md");
          return new Response(await blogIndexMarkdown(), { headers: markdownHeaders });
        }

        if (!isLandingPage(page)) return new Response("Not found", { status: 404 });

        await countAgentRead(request, "md");

        return new Response(landingMarkdown(page), { headers: markdownHeaders });
      },
    },
  },
});
