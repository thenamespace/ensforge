import { createFileRoute } from "@tanstack/react-router";

import { PostPage } from "@/components/blog/post-page";
import { categoryLabels } from "@/lib/blog/format";
import { loadBlogPost } from "@/lib/blog/loaders";
import { blogPostingLd } from "@/lib/blog/seo";
import { getPackage } from "@/lib/packages";
import { breadcrumbLd, seo } from "@/lib/seo";
import { absolute, site } from "@/lib/site";
import { blog } from "@/lib/source";

export const Route = createFileRoute("/_marketing/blog/$slug")({
  loader: async ({ params }) => {
    const data = await loadBlogPost({ data: params.slug });

    await blog.getPage(data.path)?.preload();

    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const { post, image, seo: overrides } = loaderData;
    const section = getPackage(post.package)?.name ?? categoryLabels[post.category].one;
    const keywords = [
      ...(overrides.keywords ?? []),
      ...post.tags,
      ...(post.package ? [`@ensforge/${post.package}`] : []),
      "ENS",
      "Effect",
      "TypeScript",
    ];
    const creator = post.authors.find((author) => author.x)?.x;

    const tags = seo({
      title: overrides.title ?? post.title,
      description: overrides.description ?? post.description,
      path: post.url,
      type: "article",
      image: { url: image.url, alt: image.alt, width: image.width, height: image.height },
      section,
      keywords,
      publishedTime: post.published,
      ...(post.updated ? { modifiedTime: post.updated } : {}),
      authors: post.authors.map((author) => author.url),
      ...(creator ? { twitterCreator: `@${creator}` } : {}),
      ...(overrides.canonical ? { canonical: overrides.canonical } : {}),
      ...(overrides.noindex || post.draft ? { noindex: true } : {}),
      jsonLd: [
        blogPostingLd(post, image, keywords),
        breadcrumbLd([
          { name: site.name, path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: post.url },
        ]),
      ],
    });

    return {
      ...tags,
      links: [
        ...tags.links,
        { rel: "alternate", type: "text/markdown", href: absolute(`${post.url}.md`) },
      ],
    };
  },
  component: Page,
});

function Page() {
  return <PostPage data={Route.useLoaderData()} />;
}
