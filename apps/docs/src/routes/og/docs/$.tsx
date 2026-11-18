import { createFileRoute } from "@tanstack/react-router";

import { ogResponse } from "@/lib/og/render";
import { accents, type Accent, type DocsCard, DocsImage } from "@/lib/og/templates";
import { getPackage } from "@/lib/packages";
import { source } from "@/lib/source";

const isAccent = (value: string): value is Accent => Object.hasOwn(accents, value);

/** How a docs page is labelled: its package and accent, and what kind of page it is. */
function docsCard(slugs: readonly string[], title: string): DocsCard {
  const [first, second] = slugs;
  const identifier = !/\s/.test(title);

  if (first !== "reference") {
    const pkg = getPackage(first);
    if (!pkg || !isAccent(pkg.slug))
      return { accent: "kit", section: "Docs", kind: "Guide", label: "docs", code: false };

    return {
      accent: pkg.slug,
      section: pkg.name,
      kind: slugs.length === 1 ? "Overview" : "Guide",
      label: pkg.npm,
      code: false,
    };
  }
  if (second === "errors") {
    const kind = /^[A-Z0-9_]+$/.test(title) ? "Error code" : "Error reference";
    return { accent: "kit", section: "Errors", kind, label: "reference", code: identifier };
  }

  const pkg = getPackage(second);
  if (pkg && isAccent(pkg.slug))
    return {
      accent: pkg.slug,
      section: pkg.name,
      kind: "API reference",
      label: pkg.npm,
      code: identifier,
    };

  return { accent: "kit", section: "Docs", kind: "Reference", label: "reference", code: false };
}

export const Route = createFileRoute("/og/docs/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        // The last segment is the file name (`image.png`); the rest are the page's slugs.
        const slugs = (params._splat?.split("/") ?? []).filter(Boolean).slice(0, -1);
        const page = source.getPage(slugs);
        if (!page) return new Response("Not found", { status: 404 });

        return ogResponse(
          <DocsImage
            card={docsCard(page.slugs, page.data.title)}
            title={page.data.title}
            description={page.data.description}
            path={page.url}
          />,
        );
      },
    },
  },
});
