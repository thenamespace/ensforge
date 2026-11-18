import { Link } from "@tanstack/react-router";

import { Container, revealStyle, Section, SectionHeader } from "@/components/marketing/section";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import { getPackage } from "@/lib/packages";

const kit = [
  {
    slug: "sdk",
    pitch: "The client. Every ENS read and write, for every name, on the viem clients you have.",
    facts: [
      "Reads, writes and registration",
      "Typed errors with stable codes",
      "Batches and multi-step plans",
    ],
  },
  {
    slug: "react",
    pitch: "Hooks for React 19: names, records and writes, cached and ready for the server.",
    facts: [
      "useAddress, usePrimaryName, …",
      "Suspense and SSR hydration",
      "useWrite, step by step",
    ],
  },
  {
    slug: "hca",
    pitch: "Hosted Contract Accounts: many writes in one execution, sessions and gasless writes.",
    facts: ["Batched writes, one execution", "Sessions for your app", "Bundlers and paymasters"],
    experimental: true,
  },
  {
    slug: "contracts",
    pitch: "ENS's ABIs, deployment addresses and constants, typed for viem.",
    facts: ["Every ENSv1 and ENSv2 contract", "Mainnet and Sepolia", "No dependency but viem"],
  },
] as const;

/** The kit: one card per package, its docs one click away. */
export function Packages() {
  return (
    <Section rule={false} id="packages">
      <Container className="max-w-[1400px] py-24">
        <SectionHeader
          index="01"
          eyebrow="Packages"
          wide
          title="Pick the pieces you need."
          lede="Start with the SDK. Add hooks for React, or reach for the ABIs directly. Every package is tree-shakeable, so your app carries only what it calls."
        />
        <div className="mt-14 grid border-t border-s border-dashed border-(--ek-line-strong) sm:grid-cols-2 lg:grid-cols-4">
          {kit.map((entry, index) => {
            const pkg = getPackage(entry.slug);
            if (!pkg) return null;

            return (
              <div
                key={entry.slug}
                data-reveal
                data-accent={entry.slug}
                style={revealStyle(index)}
                className="group relative flex min-h-80 flex-col border-e border-b border-dashed border-(--ek-line-strong) p-6 transition-colors duration-300 hover:bg-fd-card/60"
              >
                <pkg.Logo className="size-9 transition-colors duration-300 group-hover:text-ek-accent" />
                <h3 className="mt-8 flex items-center gap-2 text-xl font-light tracking-[-0.01em]">
                  <Link
                    to="/docs/$"
                    params={{ _splat: entry.slug }}
                    title={`${pkg.npm} documentation`}
                    onClick={() =>
                      track("cta_clicked", {
                        cta: `${entry.slug}_docs`,
                        location: "packages",
                        href: `/docs/${entry.slug}`,
                      })
                    }
                    className="rounded-sm after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fd-ring"
                  >
                    {pkg.name}
                  </Link>
                  {"experimental" in entry ? (
                    <span className="rounded border border-ek-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-ek-accent">
                      experimental
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 font-mono text-[11px] text-fd-muted-foreground">{pkg.npm}</p>
                <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
                  {entry.pitch}
                </p>
                <ul className="mt-auto flex flex-col gap-1.5 pt-6 font-mono text-[11px] text-fd-muted-foreground">
                  {entry.facts.map((fact) => (
                    <li key={fact} className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-ek-accent">
                        /
                      </span>
                      {fact}
                    </li>
                  ))}
                </ul>
                <p
                  className={cn(
                    "mt-5 border-t border-(--ek-line) pt-4 font-mono text-[11px] text-fd-foreground/80 underline decoration-(--ek-line-strong) underline-offset-4 transition-colors",
                    "group-hover:text-fd-foreground group-hover:decoration-fd-foreground",
                  )}
                >
                  {pkg.name} docs
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
