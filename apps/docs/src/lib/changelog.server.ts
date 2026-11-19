import { renderToStaticMarkup } from "react-dom/server";

import { type GitHubChangelogEntry, githubReleases } from "@fumadocs/changelog/github";
import { Markdown } from "fumadocs-core/content/md";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";

import { type PackageInfo, releasesUrl } from "./packages";
import { gitConfig } from "./shared";
import { absolute } from "./site";

// Server only: imported dynamically from server functions and routes.

/** Releases shown per changelog page. */
const RELEASES_PER_PAGE = 20;

const TTL_MS = 60 * 60 * 1000;
let cache: { readonly at: number; readonly releases: Promise<GitHubChangelogEntry[]> } | undefined;

const fetchPage = (page: number) => {
  const request = { owner: gitConfig.user, repo: gitConfig.repo, page, perPage: 100 };
  const token = process.env.GITHUB_TOKEN?.trim();

  // A revoked or mistyped token makes GitHub reject even public reads, so fall back to an
  // anonymous request rather than losing the page to a bad secret.
  return token
    ? githubReleases({ ...request, token }).catch((error: unknown) => {
        // The server log is the only place a rejected token shows up.
        // oxlint-disable-next-line no-console
        console.error("GitHub rejected GITHUB_TOKEN; retrying without it.", error);
        return githubReleases(request);
      })
    : githubReleases(request);
};

/** Pages through the releases; each page says whether another follows. */
async function fetchFrom(page: number): Promise<GitHubChangelogEntry[]> {
  const { entries, nextPage } = await fetchPage(page);

  return nextPage === undefined ? entries : [...entries, ...(await fetchFrom(nextPage))];
}

/**
 * Every release of the monorepo, newest first. Changesets tags each package's release
 * `@ensforge/<package>@<version>`, so one list serves every package's changelog. Cached for an
 * hour per server because unauthenticated GitHub requests are limited to 60 an hour; set
 * `GITHUB_TOKEN` to raise that.
 */
function repositoryReleases(): Promise<GitHubChangelogEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.releases;

  const releases = fetchFrom(1);

  cache = { at: Date.now(), releases };
  // A failed request is retried on the next visit instead of being served for an hour.
  releases.catch(() => {
    cache = undefined;
  });

  return releases;
}

/** A page of one package's releases, newest first. */
export async function packageReleases(
  pkg: PackageInfo,
  page: number,
): Promise<{ entries: GitHubChangelogEntry[]; nextPage?: number }> {
  const releases = (await repositoryReleases()).filter((entry) =>
    entry.versions?.some((version) => version.name === pkg.npm),
  );
  const start = (page - 1) * RELEASES_PER_PAGE;
  const end = start + RELEASES_PER_PAGE;

  return {
    entries: releases.slice(start, end),
    ...(end < releases.length ? { nextPage: page + 1 } : {}),
  };
}

/**
 * Release notes as HTML, rendered on the server so the browser ships no Markdown pipeline.
 * The notes come from the repository's own GitHub releases. The Markdown pipeline is async, so
 * the tree is awaited before rendering; static rendering cannot wait for a suspended component.
 */
export async function releaseHtml(markdown: string): Promise<string> {
  const tree = await Markdown({ children: markdown, async: true, remarkPlugins: [remarkGfm] });

  return renderToStaticMarkup(tree);
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

/** The latest releases as Markdown, for agents reading `/docs/<package>/changelog.md`. */
export async function changelogMarkdown(pkg: PackageInfo): Promise<string> {
  const { entries } = await packageReleases(pkg, 1);

  return [
    `# ${pkg.name} changelog`,
    `> For the complete documentation index, see [llms.txt](${absolute("/llms.txt")}).`,
    `Releases of \`${pkg.npm}\`, newest first. All releases: ${releasesUrl(pkg)}`,
    ...entries.map((entry) =>
      [`## ${entry.title}`, dateFormat.format(entry.date), entry.content ?? ""]
        .filter(Boolean)
        .join("\n\n"),
    ),
  ].join("\n\n");
}
