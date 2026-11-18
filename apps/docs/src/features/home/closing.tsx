import { useRef } from "react";

import { ArrowRightIcon } from "lucide-react";

import { GitHubIcon } from "@/components/icons/github-icon";
import { ButtonLink, ExternalButton } from "@/components/marketing/button";
import { useSectionView } from "@/components/marketing/hooks";
import { Container, Eyebrow, Heading, Lede } from "@/components/marketing/section";
import { site } from "@/lib/site";

import { Forge } from "./figures/forge";

/** Closing call to action, beside the anvil forging names. */
export function Closing() {
  const root = useRef<HTMLElement>(null);
  useSectionView(root, "closing");

  return (
    <section
      ref={root}
      id="closing"
      data-section=""
      aria-labelledby="closing-title"
      className="border-t border-(--ek-line)"
    >
      <Container className="max-w-[1400px] py-20 md:py-28">
        <div className="relative grid border border-(--ek-line) lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="ek-corners pointer-events-none absolute -inset-px" aria-hidden="true" />
          <div className="flex flex-col justify-center gap-7 p-8 md:p-14">
            <Eyebrow>Start here</Eyebrow>
            <Heading id="closing-title">Forge your first name lookup.</Heading>
            <Lede>
              Install the SDK, create a client from your viem client and read nick.eth. Five
              minutes, no wallet, and every ENS name works the same way after that.
            </Lede>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <ButtonLink
                to="/docs/$"
                params={{ _splat: "sdk" }}
                label="Get started"
                icon={<ArrowRightIcon aria-hidden="true" className="size-4" />}
                cta="closing_get_started"
                location="closing"
                className="h-11"
              />
              <ExternalButton
                href={site.github}
                label="Star on GitHub"
                icon={<GitHubIcon className="size-4" />}
                cta="closing_github"
                location="closing"
                className="h-11"
              />
            </div>
          </div>
          <div className="ek-dotted flex items-center justify-center border-t border-(--ek-line) px-6 py-10 lg:border-t-0 lg:border-s">
            <Forge className="max-w-[620px]" />
          </div>
        </div>
      </Container>
    </section>
  );
}
