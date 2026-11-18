import { createFileRoute } from "@tanstack/react-router";

import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

/** Hand-written pages in the reference section, searched with the guides. */
const handWritten = new Set(["entry-points", "known-limitations", "glossary"]);

const server = createFromSource(source, {
  language: "english",
  // Each page is tagged with its package (root folder) and its kind: the generated API reference
  // and error pages ("reference") or everything else ("guides"). Search matches every tag it is given,
  // so the dialog always sends a kind, and the package when the search is scoped to one.
  buildIndex: async (page) => {
    const { structuredData } = await page.data.load();
    const { description } = page.data;
    const [pkg, section, name] = page.slugs;
    const generated =
      section === "errors" || (section === "reference" && !handWritten.has(name ?? ""));
    const kind = generated ? "reference" : "guides";

    return {
      title: page.data.title,
      url: page.url,
      id: page.url,
      structuredData,
      ...(description === undefined ? {} : { description }),
      tag: pkg === undefined ? [kind] : [pkg, kind],
    };
  },
});

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => server.GET(request),
    },
  },
});
