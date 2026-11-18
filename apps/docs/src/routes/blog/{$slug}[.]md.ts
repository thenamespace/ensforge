import { createFileRoute } from "@tanstack/react-router";

import { markdownHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { postMarkdown } from "@/lib/blog/markdown";

/** A blog post as Markdown: `/blog/<slug>.md`. */
export const Route = createFileRoute("/blog/{$slug}.md")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const body = await postMarkdown(params.slug);
        if (!body) return new Response("Not found", { status: 404 });

        await countAgentRead(request, "md");

        return new Response(body, { headers: markdownHeaders });
      },
    },
  },
});
