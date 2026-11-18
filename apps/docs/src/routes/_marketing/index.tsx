import { createFileRoute } from "@tanstack/react-router";

import { ButtonLink } from "@/components/marketing/button";
import { Container, Heading, Lede } from "@/components/marketing/section";
import { siteImageUrl } from "@/lib/og/urls";
import { defaultPackage } from "@/lib/packages";
import { organizationLd, pageTitle, seo, webPageLd, websiteLd } from "@/lib/seo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/_marketing/")({
  head: () =>
    seo({
      description: site.description,
      path: "/",
      image: { url: siteImageUrl("home"), alt: `${site.name}: ${site.tagline}` },
      keywords: ["ENS", "Ethereum Name Service", "Effect", "TypeScript", "viem", "open source"],
      jsonLd: [
        organizationLd,
        websiteLd,
        webPageLd({
          name: pageTitle(),
          description: site.description,
          path: "/",
          image: siteImageUrl("home"),
        }),
      ],
    }),
  component: Home,
});

/** Placeholder home: the landing page is not written yet. */
function Home() {
  return (
    <Container className="flex flex-col items-start gap-6 py-24 md:py-32">
      <Heading as="h1">{site.name}</Heading>
      <Lede>{site.tagline}. Placeholder: the landing page is not written yet.</Lede>
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          to="/docs/$"
          params={{ _splat: defaultPackage }}
          label="Read the docs"
          cta="home_docs"
          location="hero"
        />
        <ButtonLink to="/blog" variant="ghost" label="Blog" cta="home_blog" location="hero" />
      </div>
    </Container>
  );
}
