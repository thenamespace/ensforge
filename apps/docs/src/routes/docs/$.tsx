import { lazy, Suspense, use } from "react";

import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/spacious";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/spacious/page";

import { DocsChromeAnalytics, DocsPageAnalytics } from "@/components/docs/analytics";
import { CopyMarkdownButton, OpenInAssistantButtons } from "@/components/docs/page-actions";
import { useMDXComponents } from "@/components/mdx";
import { ApiMeta, ErrorMeta } from "@/components/reference/api-meta";
import { ReferenceBreadcrumb } from "@/components/reference/breadcrumb";
import { baseOptions } from "@/lib/layout.shared";
import { docsImageUrl } from "@/lib/og/urls";
import { getPackage } from "@/lib/packages";
import { movedReference } from "@/lib/reference-redirects";
import { breadcrumbLd, seo, techArticleLd } from "@/lib/seo";
import { getPageMarkdownUrl, gitConfig } from "@/lib/shared";
import { absolute, site } from "@/lib/site";
import { docs, source } from "@/lib/source";
import { tabs } from "@/lib/tabs";

// Only the reference landing renders it; lazy keeps its search data out of every other page.
const ReferenceHome = lazy(() => import("@/components/reference/reference-home"));

const serverLoader = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    // Reference pages belong to the package after `reference/` (errors and the landing to none).
    const isReference = page.slugs[0] === "reference";
    const pkg = getPackage(isReference ? page.slugs[1] : page.slugs[0]);

    // The git modified date ships with the compiled page in async mode.
    const { lastModified } = await page.data.load();

    return {
      path: page.path,
      packageSlug: pkg?.slug,
      pageTree: await source.serializePageTree(source.getPageTree()),
      meta: {
        url: page.url,
        slugs: page.slugs,
        title: page.data.title,
        description:
          page.data.description ?? `${page.data.title} in the ${pkg?.name ?? site.name} docs.`,
        section: isReference ? `${pkg?.name ?? "API"} Reference` : (pkg?.name ?? "Docs"),
        isReference,
        keywords: page.data.keywords ?? [],
        published: page.data.published,
        modified: lastModified?.toISOString(),
      },
    };
  });

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/").filter(Boolean) ?? [];
    const moved = movedReference(slugs);
    if (moved) throw redirect({ href: `/docs/${moved.join("/")}`, statusCode: 301 });
    const data = await serverLoader({ data: slugs });

    await docs.getPage(data.path)?.preload();

    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { meta } = loaderData;
    const isIndex = meta.slugs.length <= 1;
    const image = docsImageUrl(meta.slugs);

    const keywords = [
      meta.section,
      "ENS",
      "Effect",
      "TypeScript",
      "documentation",
      ...meta.keywords,
    ];

    const tags = seo({
      title: meta.title,
      description: meta.description,
      path: meta.url,
      type: "article",
      image: { url: image, alt: `${meta.title}, ${meta.section} documentation` },
      section: meta.section,
      keywords,
      ...(meta.published ? { publishedTime: meta.published } : {}),
      ...(meta.modified ? { modifiedTime: meta.modified } : {}),
      jsonLd: [
        techArticleLd({
          title: meta.title,
          description: meta.description,
          path: meta.url,
          image,
          section: meta.section,
          keywords,
          ...(meta.modified ? { modifiedTime: meta.modified } : {}),
          ...(meta.published ? { publishedTime: meta.published } : {}),
        }),
        breadcrumbLd([
          { name: site.name, path: "/" },
          meta.isReference
            ? { name: "API reference", path: "/docs/reference" }
            : { name: `${meta.section} Docs`, path: `/docs/${meta.slugs[0] ?? ""}` },
          ...(isIndex ? [] : [{ name: meta.title, path: meta.url }]),
        ]),
      ],
    });

    // Point agents at the Markdown version of this page.
    return {
      ...tags,
      links: [
        ...tags.links,
        { rel: "alternate", type: "text/markdown", href: absolute(getPageMarkdownUrl(meta)) },
      ],
    };
  },
});

function Content({
  path,
  slugs,
  packageSlug,
  isReference,
}: {
  path: string;
  slugs: readonly string[];
  packageSlug: string | undefined;
  isReference: boolean;
}) {
  const markdownUrl = getPageMarkdownUrl({ slugs });
  const page = docs.getPage(path);
  if (!page) throw new Error(`Unknown page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc} {...(isReference ? { slots: { breadcrumb: ReferenceBreadcrumb } } : {})}>
      <DocsPageAnalytics packageSlug={packageSlug ?? slugs[0] ?? ""} title={page.title} />
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription className="mb-2">{page.description}</DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
        <CopyMarkdownButton markdownUrl={markdownUrl} slug={slugs.join("/")} />
        <OpenInAssistantButtons markdownUrl={markdownUrl} slug={slugs.join("/")} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${path}`}
        />
      </div>
      <DocsBody>
        <MDX components={useMDXComponents({ ApiMeta, ErrorMeta, ReferenceHome })} />
      </DocsBody>
    </DocsPage>
  );
}

function Page() {
  const data = useFumadocsLoader(Route.useLoaderData());
  const { path, pageTree, packageSlug } = data;
  const slugs = data.meta.slugs;

  return (
    <DocsLayout {...baseOptions(getPackage(packageSlug))} tree={pageTree} tabs={tabs}>
      <DocsChromeAnalytics />
      <Suspense>
        <Content
          path={path}
          slugs={slugs}
          packageSlug={packageSlug}
          isReference={data.meta.isReference}
        />
      </Suspense>
    </DocsLayout>
  );
}
