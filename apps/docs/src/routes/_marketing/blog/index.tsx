import { createFileRoute, redirect } from "@tanstack/react-router";

import { z } from "zod";

import { BlogIndex } from "@/components/blog/blog-index";
import { blogDescription } from "@/lib/blog/format";
import { loadBlogIndex } from "@/lib/blog/loaders";
import { blogCategories } from "@/lib/blog/schema";
import { blogLd } from "@/lib/blog/seo";
import { siteImageUrl } from "@/lib/og/urls";
import { breadcrumbLd, seo } from "@/lib/seo";
import { absolute, site } from "@/lib/site";

const search = z.object({ category: z.enum(blogCategories).optional().catch(undefined) });

export const Route = createFileRoute("/_marketing/blog/")({
  beforeLoad: () => {
    if (!site.blogEnabled) throw redirect({ to: "/" });
  },
  validateSearch: search,
  loader: () => loadBlogIndex(),
  head: ({ loaderData }) => {
    const image = siteImageUrl("blog");
    const tags = seo({
      title: "Blog",
      description: blogDescription,
      path: "/blog",
      image: { url: image, alt: `${site.name} blog` },
      jsonLd: [
        blogLd(loaderData?.posts ?? []),
        breadcrumbLd([
          { name: site.name, path: "/" },
          { name: "Blog", path: "/blog" },
        ]),
      ],
    });

    return {
      ...tags,
      links: [
        ...tags.links,
        { rel: "alternate", type: "text/markdown", href: absolute("/blog.md") },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { posts } = Route.useLoaderData();
  const { category } = Route.useSearch();

  return <BlogIndex posts={posts} category={category} />;
}
