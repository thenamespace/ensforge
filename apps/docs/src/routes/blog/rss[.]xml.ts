import { createFileRoute } from "@tanstack/react-router";

import { site } from "@/lib/site";

export const Route = createFileRoute("/blog/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
        if (!site.blogEnabled) return new Response("Not found", { status: 404 });

        const { blogFeed } = await import("@/lib/blog/feed.server");

        return new Response(await blogFeed(), {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
