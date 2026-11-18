import { createFileRoute } from "@tanstack/react-router";

import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

const server = createFromSource(source, {
  language: "english",
  // Tag each page with its package (root folder) so search can be scoped per package.
  buildIndex: async (page) => {
    const { structuredData } = await page.data.load();
    const { description } = page.data;
    const tag = page.slugs[0];

    return {
      title: page.data.title,
      url: page.url,
      id: page.url,
      structuredData,
      ...(description === undefined ? {} : { description }),
      ...(tag === undefined ? {} : { tag }),
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
