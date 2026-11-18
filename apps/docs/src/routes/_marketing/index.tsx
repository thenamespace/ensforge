import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/features/home/home-page";
import { snippetIds } from "@/features/home/playground/examples";
import { highlightSnippets } from "@/lib/highlight";
import { siteImageUrl } from "@/lib/og/urls";
import { organizationLd, pageTitle, seo, webPageLd, websiteLd } from "@/lib/seo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/_marketing/")({
  loader: () => highlightSnippets({ data: snippetIds }),
  head: () =>
    seo({
      description: site.description,
      path: "/",
      image: { url: siteImageUrl("home"), alt: `${site.name}: ${site.tagline}` },
      keywords: [
        "ENS",
        "ENS SDK",
        "Ethereum Name Service",
        "ENSv2",
        "viem",
        "TypeScript",
        "React hooks",
        "open source",
      ],
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

function Home() {
  const code = Route.useLoaderData();

  return <HomePage code={code} />;
}
