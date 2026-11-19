import { createFileRoute } from "@tanstack/react-router";

import { absolute, site } from "@/lib/site";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            `# ${site.name} docs. For agents, a plain-text index is at ${absolute("/llms.txt")}`,
            `# and every docs page in one file at ${absolute("/llms-full.txt")}.`,
            "",
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
