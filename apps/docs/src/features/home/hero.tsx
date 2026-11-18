import { useRef } from "react";

import { ArrowRightIcon } from "lucide-react";

import { ButtonLink } from "@/components/marketing/button";
import { useSectionView } from "@/components/marketing/hooks";
import { Heading, Lede } from "@/components/marketing/section";

import { HeroFloor } from "./hero-floor/hero-floor";

/**
 * Hero: the headline, one line on what ensforge does and where to start, over a floor of names
 * and the components ensforge powers.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  useSectionView(root, "hero");

  return (
    <section ref={root} data-section="" className="relative -mt-15 overflow-hidden">
      <HeroFloor />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-fd-background to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-fd-background to-transparent"
      />
      <div
        data-hero-content=""
        className="relative mx-auto flex min-h-[92svh] w-full max-w-[1400px] flex-col items-center justify-center gap-7 px-5 pt-32 pb-24 text-center md:px-8"
      >
        <p className="flex animate-ek-rise items-center gap-2.5 rounded-full border border-(--ek-line) bg-fd-background px-3 py-1 text-sm text-fd-muted-foreground">
          <img
            src="/brand/ens/ens-mark-Blue.svg"
            alt=""
            width={12}
            height={14}
            className="h-3.5 w-auto"
          />
          Reads, writes and registration for every name
        </p>
        <Heading
          as="h1"
          className="animate-ek-rise font-normal [animation-delay:80ms] md:text-[92px]"
        >
          <span className="ek-shine animate-ek-shine motion-reduce:animate-none">
            <span className="whitespace-nowrap">Every ENS name,</span> one API.
          </span>
        </Heading>
        <Lede className="max-w-[46ch] animate-ek-rise text-balance [animation-delay:160ms] md:text-xl">
          Resolve, update and register any name with one typed TypeScript API, built on viem.
        </Lede>
        <div className="flex animate-ek-rise flex-wrap items-center justify-center gap-3 pt-2 [animation-delay:240ms]">
          <ButtonLink
            to="/docs/$"
            params={{ _splat: "sdk" }}
            label="Get started"
            icon={<ArrowRightIcon aria-hidden="true" className="size-4" />}
            cta="home_get_started"
            location="hero"
            className="h-11 px-5"
          />
          <ButtonLink
            to="/docs/$"
            params={{ _splat: "reference" }}
            variant="ghost"
            label="API reference"
            cta="home_reference"
            location="hero"
            className="h-11 px-5"
          />
        </div>
      </div>
    </section>
  );
}
