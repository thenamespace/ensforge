import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import type { LegalData } from "@/components/marketing/legal-page";
import { legal, legalSource } from "@/lib/source";

/** Loads a terms or privacy page's frontmatter on the server and preloads its compiled body. */
export const loadLegal = createServerFn({ method: "GET" })
  .validator((slug: "terms" | "privacy") => slug)
  .handler(async ({ data: slug }): Promise<LegalData> => {
    const page = legalSource.getPage([slug]);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description ?? "",
      updated: page.data.updated,
    };
  });

export const preloadLegal = (path: string) => legal.getPage(path)?.preload();
