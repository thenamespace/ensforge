import { Suspense, use } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/spacious";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/spacious/page";

import { DocsChromeAnalytics } from "@/components/docs/analytics";
import { useMDXComponents } from "@/components/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { siteImageUrl } from "@/lib/og/urls";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";
import { site } from "@/lib/site";
import { docs, source } from "@/lib/source";
import { tabs } from "@/lib/tabs";

const serverLoader = createServerFn({ method: "GET" }).handler(async () => {
  const page = source.getPage([]);
  if (!page) throw notFound();

  return {
    path: page.path,
    title: page.data.title,
    description: page.data.description ?? `Documentation for the ${site.name} packages.`,
    pageTree: await source.serializePageTree(source.getPageTree()),
  };
});

/** The docs home: the `DocsHome` landing, rendered from `content/docs/index.mdx` (its hero is the h1). */
export const Route = createFileRoute("/docs/")({
  component: Page,
  loader: async () => {
    const data = await serverLoader();

    await docs.getPage(data.path)?.preload();

    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const image = siteImageUrl("home");

    return seo({
      description: loaderData.description,
      path: "/docs",
      image: { url: image, alt: `${site.name} documentation` },
      jsonLd: [
        webPageLd({
          name: loaderData.title,
          description: loaderData.description,
          path: "/docs",
          image,
        }),
        breadcrumbLd([
          { name: site.name, path: "/" },
          { name: "Docs", path: "/docs" },
        ]),
      ],
    });
  },
});

function Content({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`Unknown page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsBody>
        <MDX components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function Page() {
  const data = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={data.pageTree} tabs={tabs}>
      <DocsChromeAnalytics />
      <Suspense>
        <Content path={data.path} />
      </Suspense>
    </DocsLayout>
  );
}
