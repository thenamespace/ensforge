import { Container, Section, SectionHeader } from "@/components/marketing/section";
import type { HighlightedSnippets } from "@/lib/highlight";

import { Closing } from "./closing";
import { Hero } from "./hero";
import { HowItFits } from "./how-it-fits";
import { Packages } from "./packages";
import { Playground } from "./playground/playground";

/**
 * Home: what ensforge is (hero), which packages exist, how it sits between an app and ENS, a
 * playground running real reads, and where to start. Each block answers the next question a
 * new reader has.
 */
export function HomePage({ code }: { readonly code: HighlightedSnippets }) {
  return (
    <div className="ens-home">
      <Hero />
      <Packages />
      <HowItFits />
      <Section id="playground">
        <Container className="max-w-[1400px] py-24 md:py-32">
          <SectionHeader
            index="02"
            eyebrow="Playground"
            title="Read ENS from your browser."
            lede="Real calls to Ethereum mainnet with @ensforge/sdk. Pick a name, press Run, and see the value, the JSON and the code that fetched it."
            wide
          />
          <div className="mt-12" data-reveal>
            <Playground code={code} />
          </div>
        </Container>
      </Section>
      <Closing />
    </div>
  );
}
