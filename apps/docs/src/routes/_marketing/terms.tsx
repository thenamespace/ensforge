import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/marketing/legal-page";
import { loadLegal, preloadLegal } from "@/lib/legal";
import { siteImageUrl } from "@/lib/og/urls";
import { seo } from "@/lib/seo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/_marketing/terms")({
  loader: async () => {
    const data = await loadLegal({ data: "terms" });

    await preloadLegal(data.path);

    return data;
  },
  head: () =>
    seo({
      title: "Terms of use",
      description:
        "The terms for using ensforge.com and its documentation, run by Namespace Inc.: site content, the playground, no warranty, liability limits and contact.",
      path: "/terms",
      image: { url: siteImageUrl("home"), alt: `${site.name}: ${site.tagline}` },
      keywords: ["terms of use", "ensforge", "Namespace Inc.", "ENS"],
    }),
  component: Page,
});

function Page() {
  return <LegalPage data={Route.useLoaderData()} />;
}
