import { createMiddleware } from "@tanstack/react-start";

import { isMarkdownPreferred } from "fumadocs-core/negotiation";

import { landingMarkdown, landingPaths } from "@/content/landing-markdown";

import { markdownHeaders } from "./agent-headers";
import { countAgentRead } from "./analytics/agent";
import { defaultPackage, getChangelogPackage } from "./packages";
import { docsLlms, source } from "./source";

/**
 * Serves the Markdown version of a landing, docs or blog page when the client asks for `text/markdown`, so agents
 * get clean text from the same URL people read. Everything else passes through.
 */
export const markdownNegotiation = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const { pathname } = new URL(request.url);

    if (pathname.endsWith(".md") || !isMarkdownPreferred(request)) return next();

    const landing = landingPaths[pathname];

    if (landing) {
      await countAgentRead(request, "negotiated");
      return new Response(landingMarkdown(landing), { headers: markdownHeaders });
    }

    if (pathname === "/blog" || pathname.startsWith("/blog/")) {
      const { blogIndexMarkdown, postMarkdown } = await import("./blog/markdown");
      const slug = pathname.slice("/blog/".length).replace(/\/$/, "");
      const body = slug ? await postMarkdown(slug) : await blogIndexMarkdown();

      if (!body) return next();

      await countAgentRead(request, "negotiated");
      return new Response(body, { headers: markdownHeaders });
    }

    const isDocs = pathname === "/docs" || pathname.startsWith("/docs/");

    if (!isDocs) return next();

    const slugs = pathname.slice("/docs".length).split("/").filter(Boolean);
    const changelog = getChangelogPackage(slugs);

    if (changelog) {
      await countAgentRead(request, "negotiated");
      const { changelogMarkdown } = await import("./changelog.server");
      return new Response(await changelogMarkdown(changelog), { headers: markdownHeaders });
    }

    const page = source.getPage(slugs.length > 0 ? slugs : [defaultPackage]);

    if (!page) return next();

    await countAgentRead(request, "negotiated");

    return new Response(await docsLlms.page(page), { headers: markdownHeaders });
  },
);
