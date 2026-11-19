import { useEffect } from "react";

import { type ErrorComponentProps, useRouter, useRouterState } from "@tanstack/react-router";

import { ErrorShell } from "@/components/errors/error-shell";
import { BrokenLinkIllustration } from "@/components/errors/illustrations";
import { ButtonLink } from "@/components/marketing/button";
import { captureError, track } from "@/lib/analytics/client";

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const message = error instanceof Error ? error.message : String(error);

  useEffect(() => {
    captureError(error, { path });
    track("route_error", { path, message: message.slice(0, 200) });
  }, [error, path, message]);

  const retry = () => {
    // Reload loaders first, then clear the error boundary so the route renders again.
    void router.invalidate();
    reset();
  };

  return (
    <ErrorShell
      code="// Error"
      title="Something went wrong"
      illustration={<BrokenLinkIllustration />}
    >
      <p className="max-w-md text-base text-pretty text-fd-muted-foreground">
        The page failed to load. Try again, or go back to the home page. If it keeps happening,
        please tell us on GitHub.
      </p>
      {import.meta.env.DEV ? (
        <pre className="max-w-full overflow-x-auto rounded-md border text-left border-(--ek-line-strong) bg-fd-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-fd-foreground">
          {message}
        </pre>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          title="Try again"
          onClick={retry}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground shadow-[0_0_0_1px_var(--ek-line-strong)] transition-colors hover:bg-fd-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
        >
          Try again
        </button>
        <ButtonLink to="/" variant="ghost" label="Home" cta="error_home" location="section" />
      </div>
    </ErrorShell>
  );
}
