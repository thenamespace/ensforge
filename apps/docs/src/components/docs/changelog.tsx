import { Link } from "@tanstack/react-router";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

// Adapted from the Fumadocs changelog timeline (MIT), with notes rendered to HTML on the server.

export interface ChangelogRelease {
  readonly id: string;
  readonly title: string;
  /** ISO date, so the release crosses the server function boundary as a string. */
  readonly date: string;
  readonly url: string | undefined;
  readonly prerelease: boolean;
  /** Release notes, rendered from Markdown on the server. */
  readonly html: string;
}

const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Releases grouped by month, newest first, on a vertical line. */
export function ChangelogTimeline({
  releases,
  slug,
}: {
  readonly releases: readonly ChangelogRelease[];
  readonly slug: string;
}) {
  const months = new Map<string, ChangelogRelease[]>();

  for (const release of releases.toSorted((a, b) => b.date.localeCompare(a.date))) {
    const month = monthFormat.format(new Date(release.date));
    const items = months.get(month);

    if (items) items.push(release);
    else months.set(month, [release]);
  }

  return (
    <div className="flex flex-col gap-8">
      {Array.from(months, ([month, items]) => (
        <section key={month}>
          <h2 className="sticky top-14 z-1 bg-fd-background/80 py-4 font-mono text-xs tracking-[0.08em] text-fd-muted-foreground uppercase backdrop-blur-sm">
            {month}
          </h2>
          <ol className="ms-3 border-s ps-6">
            {items.map((release) => (
              <ChangelogItem key={release.id} release={release} slug={slug} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ChangelogItem({
  release,
  slug,
}: {
  readonly release: ChangelogRelease;
  readonly slug: string;
}) {
  const date = new Date(release.date);

  return (
    <li id={release.id} className="scroll-mt-28 pb-10 last:pb-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <time
          dateTime={release.date}
          className="relative pe-2 text-xs font-medium text-fd-primary tabular-nums"
        >
          <span className="absolute -start-6 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fd-primary rtl:translate-x-1/2" />
          {dayFormat.format(date)}
        </time>
        {release.prerelease ? (
          <span className="rounded-md border bg-fd-secondary px-1.5 py-0.5 font-mono text-xs text-fd-secondary-foreground">
            pre-release
          </span>
        ) : null}
      </div>
      <h3 className="mb-4 font-mono text-[15px] font-semibold">
        {release.url ? (
          <a
            href={release.url}
            title={`${release.title} on GitHub`}
            onClick={() =>
              track("changelog_release_clicked", { package: slug, release: release.title })
            }
            className="transition-colors hover:text-fd-primary"
          >
            {release.title}
          </a>
        ) : (
          release.title
        )}
      </h3>
      <div
        className="prose prose-sm text-fd-muted-foreground"
        // Rendered on our server from the packages' own GitHub release notes.
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: release.html }}
      />
    </li>
  );
}

const pageLink =
  "inline-flex items-center gap-1.5 rounded-lg border bg-fd-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground";

/** Links to the pages of newer and older releases. */
export function ChangelogPagination({
  slug,
  newer,
  older,
  className,
}: {
  readonly slug: string;
  readonly newer?: number | undefined;
  readonly older?: number | undefined;
  readonly className?: string;
}) {
  if (newer === undefined && older === undefined) return null;

  return (
    <nav aria-label="Changelog pages" className={cn("flex flex-row", className)}>
      {newer === undefined ? null : (
        <Link
          to="/docs/$package/changelog/{-$page}"
          params={{ package: slug, page: newer === 1 ? undefined : String(newer) }}
          title="Newer releases"
          className={pageLink}
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          Newer
        </Link>
      )}
      {older === undefined ? null : (
        <Link
          to="/docs/$package/changelog/{-$page}"
          params={{ package: slug, page: String(older) }}
          title="Older releases"
          className={cn(pageLink, "ms-auto")}
        >
          Older
          <ChevronRightIcon className="size-4 rtl:rotate-180" />
        </Link>
      )}
    </nav>
  );
}
