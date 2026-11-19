import { createFileRoute } from "@tanstack/react-router";

import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

/** Hand-written pages of the reference root (SDK pages), searched with the guides. */
const handWritten = new Set(["entry-points", "known-limitations", "glossary"]);

const server = createFromSource(source, {
  language: "english",
  // Each page is tagged with its package and its kind: the generated API reference under
  // `/docs/reference` ("reference") or everything else ("guides"). A reference page's package is
  // the folder after `reference/`; error codes count as the SDK's, where `Errors` lives. Search
  // matches every tag it is given, so the dialog always sends a kind, and the package when the
  // search is scoped to one.
  buildIndex: async (page) => {
    const { structuredData } = await page.data.load();
    const { description } = page.data;
    const [root, section] = page.slugs;
    const isReference = root === "reference";
    const kind = isReference && !handWritten.has(section ?? "") ? "reference" : "guides";
    const pkg = !isReference
      ? root
      : section === "errors" || handWritten.has(section ?? "")
        ? "sdk"
        : section;

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
