import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
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
