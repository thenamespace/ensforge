import { createFileRoute } from "@tanstack/react-router";

import { ogResponse } from "@/lib/og/render";
import { SiteImage } from "@/lib/og/templates";
import type { SitePage } from "@/lib/og/urls";

const isSitePage = (page: string): page is SitePage => page === "home" || page === "blog";

export const Route = createFileRoute("/og/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        // `.png` comes from links shared before the switch to WebP.
        const page = (params._splat ?? "").replace(/\.(webp|png)$/, "");
        if (!isSitePage(page)) return new Response("Not found", { status: 404 });

        return ogResponse(<SiteImage page={page} />);
      },
    },
  },
});
