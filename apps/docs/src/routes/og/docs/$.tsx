import { createFileRoute } from "@tanstack/react-router";

import { ogResponse } from "@/lib/og/render";
import { accents, DocsImage, type Accent } from "@/lib/og/templates";
import { getPackage } from "@/lib/packages";
import { source } from "@/lib/source";

const isAccent = (value: string): value is Accent => Object.hasOwn(accents, value);

/** The accent and crumb of a docs page; reference pages take their package's, errors the SDK's. */
function docsCard(slugs: readonly string[]): { accent: Accent; section: string } {
  const [first, second] = slugs;

  if (first !== "reference") {
    const pkg = getPackage(first);
    return {
      accent: first !== undefined && isAccent(first) ? first : "kit",
      section: pkg?.name ?? "Docs",
    };
  }
  if (second === "errors") return { accent: "sdk", section: "Errors" };

  const pkg = getPackage(second);
  if (pkg && isAccent(pkg.slug)) return { accent: pkg.slug, section: pkg.name };

  return { accent: "kit", section: "Reference" };
}

export const Route = createFileRoute("/og/docs/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        // The last segment is the file name (`image.png`); the rest are the page's slugs.
        const slugs = (params._splat?.split("/") ?? []).filter(Boolean).slice(0, -1);
        const page = source.getPage(slugs);
        if (!page) return new Response("Not found", { status: 404 });

        const { accent, section } = docsCard(page.slugs);

        return ogResponse(
          <DocsImage
            accent={accent}
            section={section}
            title={page.data.title}
            description={page.data.description}
          />,
        );
      },
    },
  },
});
