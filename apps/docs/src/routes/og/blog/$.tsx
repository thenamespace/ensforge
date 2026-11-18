import { createFileRoute } from "@tanstack/react-router";

import { getAuthor } from "@/lib/blog/authors";
import { categoryLabels, formatShortDate } from "@/lib/blog/format";
import { getBlogPage } from "@/lib/blog/posts";
import { ogResponse } from "@/lib/og/render";
import { BlogImage } from "@/lib/og/templates";
import { site } from "@/lib/site";

export const Route = createFileRoute("/og/blog/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        if (!site.blogEnabled) return new Response("Not found", { status: 404 });

        const slug = (params._splat ?? "").replace(/\.png$/, "");
        const page = getBlogPage(slug);
        if (!page) return new Response("Not found", { status: 404 });

        const { data } = page;
        const names = data.authors.map((id) => getAuthor(id)?.name ?? id);

        return ogResponse(
          <BlogImage
            accent={data.package ?? "kit"}
            category={categoryLabels[data.category].one}
            date={formatShortDate(data.published)}
            title={data.title}
            byline={`By ${names.join(", ")}`}
          />,
        );
      },
    },
  },
});
