import { createFileRoute } from "@tanstack/react-router";

import { absolute } from "@/lib/site";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "User-agent: *",
            "Allow: /",
            "Disallow: /api/",
            "",
            `Sitemap: ${absolute("/sitemap.xml")}`,
            "",
          ].join("\n"),
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        ),
    },
  },
});
