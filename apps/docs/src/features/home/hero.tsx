import { useRef } from "react";

import { ArrowRightIcon } from "lucide-react";

import { ButtonLink } from "@/components/marketing/button";
import { useSectionView } from "@/components/marketing/hooks";
import { InstallCommand } from "@/components/marketing/install-command";
import { Heading, Lede } from "@/components/marketing/section";

import { NameResolve } from "./figures/name-resolve";
import { IsoField } from "./iso-field";

const install = [
  { id: "sdk", label: "SDK", packages: "@ensforge/sdk viem effect" },
  { id: "react", label: "React", packages: "@ensforge/react @ensforge/sdk viem effect" },
] as const;

/**
 * Hero: the pitch and install command on the left, a name resolving through ENS on the right,
 * over the isometric floor that breathes behind the whole band.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  useSectionView(root, "hero");

  return (
    <section ref={root} data-section="" className="relative -mt-15 overflow-hidden">
      <IsoField className="absolute inset-0 size-full" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_30%_52%,var(--color-fd-background)_40%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-fd-background via-fd-background/80 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-fd-background to-transparent"
      />
      <div className="relative mx-auto grid min-h-svh w-full max-w-[1400px] items-center gap-12 px-5 pt-32 pb-20 md:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-28">
        <div className="flex flex-col items-start gap-8">
          <p className="flex animate-ek-rise items-center gap-2.5 rounded-full border border-(--ek-line) bg-fd-background px-3 py-1 text-sm text-fd-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-ek-accent/60 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-ek-accent" />
            </span>
            Reads, writes and registration for every name
          </p>
          <Heading
            as="h1"
            className="animate-ek-rise font-normal [animation-delay:80ms] md:text-[84px]"
          >
            <span className="ek-shine animate-ek-shine motion-reduce:animate-none">
              The SDK for ENS.
            </span>
          </Heading>
          <Lede className="animate-ek-rise text-pretty [animation-delay:160ms] md:text-xl">
            Look up any name, read and write records, register and manage names. One typed API that
            works for every name, built on viem.
          </Lede>
          <InstallCommand options={install} className="animate-ek-rise [animation-delay:220ms]" />
          <div className="flex animate-ek-rise flex-wrap items-center gap-3 [animation-delay:280ms]">
            <ButtonLink
              to="/docs/$"
              params={{ _splat: "sdk" }}
              label="Get started"
              icon={<ArrowRightIcon aria-hidden="true" className="size-4" />}
              cta="home_get_started"
              location="hero"
              className="h-11"
            />
            <ButtonLink
              to="/docs/$"
              params={{ _splat: "reference" }}
              variant="ghost"
              label="API reference"
              cta="home_reference"
              location="hero"
              className="h-11"
            />
          </div>
        </div>
        <div className="relative animate-ek-rise [animation-delay:200ms]">
          <NameResolve className="mx-auto max-w-[640px]" />
        </div>
      </div>
    </section>
  );
}
