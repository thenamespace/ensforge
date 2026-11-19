import { useEffect } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/spacious";
import { DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/spacious/page";

import { DocsChromeAnalytics } from "@/components/docs/analytics";
import { ChangelogPagination, ChangelogTimeline } from "@/components/docs/changelog";
import { track } from "@/lib/analytics/client";
import { baseOptions } from "@/lib/layout.shared";
import { docsImageUrl } from "@/lib/og/urls";
import { getChangelogPackage, getPackage, releasesUrl } from "@/lib/packages";
import { sidebarTree } from "@/lib/page-tree";
import { breadcrumbLd, seo } from "@/lib/seo";
import { site } from "@/lib/site";
import { source } from "@/lib/source";
import { tabs } from "@/lib/tabs";

const loadChangelog = createServerFn({ method: "GET" })
  .validator((input: { readonly slug: string; readonly page: number }) => input)
  .handler(async ({ data: { slug, page } }) => {
    const pkg = getChangelogPackage([slug, "changelog"]);
    if (!pkg || !Number.isInteger(page) || page < 1) throw notFound();

    const { packageReleases, releaseHtml } = await import("@/lib/changelog.server");
    // The changelog sits beside the package's guides, so their sidebar stays open.
    const pageTree = await source.serializePageTree(
      sidebarTree(source.getPageTree(), `/docs/${slug}`),
    );

    // GitHub can be down or rate limited; the page still renders and links to the releases.
    const result = await packageReleases(pkg, page).catch(() => undefined);
    if (!result) return { slug, page, pageTree, releases: [], unavailable: true };

    const { entries, nextPage } = result;
    if (entries.length === 0 && page > 1) throw notFound();

    const releases = await Promise.all(
      entries.map(async (entry) => ({
        id: entry.id,
        title: entry.title,
        date: entry.date.toISOString(),
        prerelease: entry.prerelease,
        url: entry.url,
        html: await releaseHtml(entry.content ?? ""),
      })),
    );

    return { slug, page, pageTree, releases, nextPage, unavailable: false };
  });

export const Route = createFileRoute("/docs/$package/changelog/{-$page}")({
  component: Page,
  loader: ({ params }) =>
    loadChangelog({ data: { slug: params.package, page: Number(params.page ?? "1") } }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const pkg = getPackage(loaderData.slug);
    const name = pkg?.name ?? site.name;
    const path = `/docs/${loaderData.slug}/changelog${loaderData.page > 1 ? `/${loaderData.page}` : ""}`;

    return seo({
      title: `${name} changelog${loaderData.page > 1 ? `, page ${loaderData.page}` : ""}`,
      description: `Release notes for ${pkg?.npm ?? site.name}, newest first, from its GitHub releases: what changed in each published version of the ${name} package.`,
      path,
      type: "article",
      image: { url: docsImageUrl([loaderData.slug]), alt: `${name} changelog` },
      section: name,
      keywords: [name, "changelog", "release notes", pkg?.npm ?? site.name, "ENS"],
      jsonLd: [
        breadcrumbLd([
          { name: `${name} docs`, path: `/docs/${loaderData.slug}` },
          { name: "Changelog", path },
        ]),
      ],
    });
  },
});

function Page() {
  const { slug, page, pageTree, releases, nextPage, unavailable } = useFumadocsLoader(
    Route.useLoaderData(),
  );

  useEffect(() => {
    track("changelog_viewed", {
      package: slug,
      page,
      release_count: releases.length,
      unavailable,
    });
  }, [slug, page, releases.length, unavailable]);

  const pkg = getPackage(slug);
  if (!pkg) throw new Error(`Unknown package: ${slug}`);

  const releasesLink = (label: string) => (
    <a
      href={releasesUrl(pkg)}
      title={`${pkg.npm} releases on GitHub`}
      className="underline underline-offset-4"
    >
      {label}
    </a>
  );

  return (
    <DocsLayout {...baseOptions(pkg)} tree={pageTree} tabs={tabs}>
      <DocsChromeAnalytics />
      <DocsPage toc={[]}>
        <DocsTitle>Changelog</DocsTitle>
        <DocsDescription className="mb-2">
          Release notes for <code>{pkg.npm}</code>, newest first, from{" "}
          {releasesLink("its GitHub releases")}.
        </DocsDescription>
        <div className="border-t pt-6">
          {unavailable ? (
            <p className="text-fd-muted-foreground">
              The releases could not be loaded right now. Read them {releasesLink("on GitHub")}.
            </p>
          ) : (
            <ChangelogTimeline releases={releases} slug={slug} />
          )}
          <ChangelogPagination
            slug={slug}
            newer={page > 1 ? page - 1 : undefined}
            older={nextPage}
            className="mt-10"
          />
        </div>
      </DocsPage>
    </DocsLayout>
  );
}
