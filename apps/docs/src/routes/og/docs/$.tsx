import { createFileRoute } from "@tanstack/react-router";

import { ogResponse } from "@/lib/og/render";
import { accents, DocsImage, type Accent } from "@/lib/og/templates";
import { getPackage } from "@/lib/packages";
import { source } from "@/lib/source";

const isAccent = (value: string): value is Accent => Object.hasOwn(accents, value);

export const Route = createFileRoute("/og/docs/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        // The last segment is the file name (`image.png`); the rest are the page's slugs.
        const slugs = (params._splat?.split("/") ?? []).filter(Boolean).slice(0, -1);
        const page = source.getPage(slugs);
        if (!page) return new Response("Not found", { status: 404 });

        const slug = page.slugs[0];
        const pkg = getPackage(slug);
        const accent: Accent = slug !== undefined && isAccent(slug) ? slug : "kit";

        return ogResponse(
          <DocsImage
            accent={accent}
            slug={slug}
            section={pkg?.name ?? "Docs"}
            title={page.data.title}
            description={page.data.description}
          />,
        );
      },
    },
  },
});
