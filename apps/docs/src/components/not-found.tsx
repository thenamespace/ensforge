import { useEffect } from "react";

import { Link, useRouterState } from "@tanstack/react-router";

import { useSearchContext } from "fumadocs-ui/contexts/search";

import { ErrorShell } from "@/components/errors/error-shell";
import { MissingRouteIllustration } from "@/components/errors/illustrations";
import { ButtonLink } from "@/components/marketing/button";
import { track } from "@/lib/analytics/client";
import { documentedPackages } from "@/lib/packages";

const linkClass =
  "rounded-md px-2 py-2 text-sm text-fd-muted-foreground underline-offset-4 transition-colors hover:text-fd-foreground hover:underline focus-visible:outline-2 focus-visible:outline-fd-ring";

function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    return "";
  }
}

export function NotFound() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenSearch } = useSearchContext();

  useEffect(() => {
    track("page_not_found", { path, referrer_host: referrerHost() });
  }, [path]);

  return (
    <ErrorShell
      code="// 404"
      title="Page not found"
      illustration={<MissingRouteIllustration path={path} />}
    >
      <p className="max-w-md text-base text-pretty text-fd-muted-foreground">
        Nothing lives at{" "}
        <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-[0.9em] break-all text-fd-foreground">
          {path}
        </code>
        . It may have moved. Search the docs or start from one of these.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ButtonLink to="/" label="Home" cta="not_found_home" location="section" />
        <button
          type="button"
          title="Search the docs"
          onClick={() => setOpenSearch(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-(--ek-line-strong) px-4 text-sm font-medium transition-colors hover:border-fd-foreground/25 hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
        >
          Search docs
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        {documentedPackages.map((pkg) => (
          <Link
            key={pkg.slug}
            to="/docs/$"
            params={{ _splat: pkg.slug }}
            title={`${pkg.name} docs`}
            className={linkClass}
          >
            {pkg.name} docs
          </Link>
        ))}
      </div>
    </ErrorShell>
  );
}
