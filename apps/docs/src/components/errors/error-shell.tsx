import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";

/**
 * Page frame for the error pages: a full-height section under the nav, like the home hero, with
 * the illustration centred on the dot grid and the message and actions below it.
 */
export function ErrorShell({
  code,
  title,
  children,
  illustration,
}: {
  readonly code: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly illustration: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-fd-background">
      <MarketingNav />
      <main className="relative -mt-15 flex min-h-svh items-center justify-center overflow-hidden px-5 pt-24 pb-16">
        <div aria-hidden="true" className="ek-err-backdrop pointer-events-none absolute inset-0" />
        <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
          <div className="w-full max-w-[620px] animate-ek-rise">{illustration}</div>
          <p className="mt-2 animate-ek-rise font-mono text-sm text-ek-accent [animation-delay:80ms]">
            {code}
          </p>
          <h1 className="mt-3 animate-ek-rise text-4xl font-light tracking-[-0.02em] text-balance [animation-delay:120ms] sm:text-5xl">
            {title}
          </h1>
          <div className="mt-5 flex animate-ek-rise flex-col items-center gap-5 [animation-delay:180ms]">
            {children}
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
