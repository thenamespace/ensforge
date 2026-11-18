import { createFileRoute, Link } from "@tanstack/react-router";

import { BlogHeader, PostGrid } from "@/components/blog/blog-index";
import { Container } from "@/components/marketing/section";
import { tagLabels } from "@/lib/blog/format";
import { loadBlogTag } from "@/lib/blog/loaders";
import { siteImageUrl } from "@/lib/og/urls";
import { breadcrumbLd, seo } from "@/lib/seo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/_marketing/blog/tags/$tag")({
  loader: ({ params }) => loadBlogTag({ data: params.tag }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const label = tagLabels[loaderData.tag];
    const path = `/blog/tags/${loaderData.tag}`;

    return seo({
      title: `${label} posts`,
      description: `${site.name} blog posts tagged ${label}.`,
      path,
      image: { url: siteImageUrl("blog"), alt: `${site.name} blog` },
      jsonLd: [
        breadcrumbLd([
          { name: site.name, path: "/" },
          { name: "Blog", path: "/blog" },
          { name: label, path },
        ]),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { tag, posts } = Route.useLoaderData();
  const count = `${posts.length} ${posts.length === 1 ? "post" : "posts"}`;

  return (
    <>
      <BlogHeader
        crumb={
          <Link to="/blog" title="All posts" className="hover:text-fd-foreground">
            Blog
          </Link>
        }
        title={`#${tag}`}
        lede={`${count} tagged ${tagLabels[tag]}.`}
      />
      <Container className="pt-10 pb-24 md:pt-12">
        <PostGrid posts={posts} />
      </Container>
    </>
  );
}
