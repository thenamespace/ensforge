import type { ReactNode } from "react";

import contractsPackage from "@ensforge/contracts/package.json";
import hcaPackage from "@ensforge/hca/package.json";
import reactPackage from "@ensforge/react/package.json";
import sdkPackage from "@ensforge/sdk/package.json";
import { Link } from "fumadocs-core/link";

import { GitHubIcon } from "@/components/icons/github-icon";
import { cn } from "@/lib/cn";
import { gitConfig } from "@/lib/shared";

const versions: Readonly<Record<string, string>> = {
  sdk: sdkPackage.version,
  react: reactPackage.version,
  hca: hcaPackage.version,
  contracts: contractsPackage.version,
};

/**
 * GitHub URL of a `source` attribute (`packages/sdk/src/….ts#L12`, or a folder). It points at the
 * package's release tag (`@ensforge/sdk@1.0.0`), as changesets tags each release, so the link
 * shows the code that shipped; the version comes from the package, not the generated page, so a
 * release does not make the generated reference stale.
 */
export function sourceUrl(source: string) {
  const pkg = /^packages\/([^/]+)\//.exec(source)?.[1];
  const version = pkg === undefined ? undefined : versions[pkg];
  const ref = version === undefined ? gitConfig.branch : `@ensforge/${pkg}@${version}`;
  const kind = /\.[a-z]+(#|$)/.test(source) ? "blob" : "tree";

  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/${kind}/${ref}/${source}`;
}

function Badge({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-wider uppercase",
        accent ? "border-ek-accent/40 bg-ek-accent/10 text-ek-accent" : "text-fd-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MetaRow({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="not-prose flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-4 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="ms-auto flex items-center gap-3 text-fd-muted-foreground">{aside}</div>
    </div>
  );
}

/**
 * The meta strip of a generated reference page, after effect.website's: kind and stability badges
 * and a count summary on the left; "Since" and a link to the source on the right.
 */
export function ApiMeta({
  kind,
  batchable = false,
  stability,
  summary,
  since,
  source,
}: {
  readonly kind?: string;
  readonly batchable?: boolean;
  readonly stability?: string;
  readonly summary?: string;
  readonly since?: string;
  readonly source?: string;
}) {
  return (
    <MetaRow
      aside={
        <>
          {since ? <span>Since v{since}</span> : null}
          {source ? (
            <a
              href={sourceUrl(source)}
              target="_blank"
              rel="noreferrer"
              title="View the source on GitHub"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-fd-foreground"
            >
              <GitHubIcon className="size-3.5" />
              View source
            </a>
          ) : null}
        </>
      }
    >
      {kind ? <Badge accent>{kind}</Badge> : null}
      {batchable ? <Badge>Batchable</Badge> : null}
      {stability ? <Badge>{stability}</Badge> : null}
      {summary ? <span className="text-fd-muted-foreground">{summary}</span> : null}
    </MetaRow>
  );
}

/** The header of an error code page: its class (linked), package and whether a retry can help. */
export function ErrorMeta({
  errorClass,
  href,
  package: packageName,
  retryable = false,
}: {
  readonly errorClass: string;
  readonly href: string;
  readonly package: string;
  readonly retryable?: boolean;
}) {
  return (
    <MetaRow aside={<span>{packageName}</span>}>
      <Link
        href={href}
        className="rounded-md border border-ek-accent/40 bg-ek-accent/10 px-1.5 py-0.5 font-medium text-ek-accent transition-colors hover:bg-ek-accent/20"
      >
        {errorClass}
      </Link>
      <Badge>{retryable ? "Retryable" : "Not retryable"}</Badge>
    </MetaRow>
  );
}
