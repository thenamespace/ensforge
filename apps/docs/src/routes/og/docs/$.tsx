import { createFileRoute } from "@tanstack/react-router";

import { ogResponse } from "@/lib/og/render";
import { accents, type Accent, type DocsCard, DocsImage } from "@/lib/og/templates";
import { getPackage } from "@/lib/packages";
import { site } from "@/lib/site";
import { source } from "@/lib/source";

const isAccent = (value: string): value is Accent => Object.hasOwn(accents, value);

/**
 * How a docs page is labelled: its package and accent, what kind of page it is, and its title. A
 * package's index page takes the package's name as its title, so the four read apart.
 */
function docsCard(slugs: readonly string[], title: string): DocsCard {
  const [first, second] = slugs;
  // API names and error codes (`batch`, `record.get`, `ConfigError`, `UNKNOWN_CHAIN`), not plain
  // words such as "React" or "Deployments".
  const identifier = !/\s/.test(title) && /^[a-z]|[._]|[a-z][A-Z]/.test(title);

  if (first !== "reference") {
    const pkg = getPackage(first);
    if (!pkg || !isAccent(pkg.slug))
      return { accent: "kit", section: "Docs", kind: "Guide", code: false, title };
    if (slugs.length === 1) {
      const name = pkg.slug === "sdk" ? `${site.name} SDK` : pkg.name;
      return { accent: pkg.slug, section: pkg.name, kind: title, code: false, title: name };
    }

    return { accent: pkg.slug, section: pkg.name, kind: "Guide", code: false, title };
  }
  if (second === "errors") {
    const kind = /^[A-Z0-9_]+$/.test(title) ? "Error code" : "Error reference";
    return { accent: "kit", section: "Errors", kind, code: identifier, title };
  }

  const pkg = getPackage(second);
  if (pkg && isAccent(pkg.slug))
    return { accent: pkg.slug, section: pkg.name, kind: "API reference", code: identifier, title };

  return { accent: "kit", section: "Docs", kind: "Reference", code: false, title };
}

export const Route = createFileRoute("/og/docs/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        // The last segment is the file name (`image.webp`, or `image.png` from links shared before the
        // switch to WebP); the rest are the page's slugs.
        const slugs = (params._splat?.split("/") ?? []).filter(Boolean).slice(0, -1);
        const page = source.getPage(slugs);
        if (!page) return new Response("Not found", { status: 404 });

        return ogResponse(
          <DocsImage
            card={docsCard(page.slugs, page.data.title)}
            description={page.data.description}
          />,
        );
      },
    },
  },
});
