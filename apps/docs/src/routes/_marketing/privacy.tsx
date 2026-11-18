import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/marketing/legal-page";
import { loadLegal, preloadLegal } from "@/lib/legal";
import { siteImageUrl } from "@/lib/og/urls";
import { seo } from "@/lib/seo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/_marketing/privacy")({
  loader: async () => {
    const data = await loadLegal({ data: "privacy" });

    await preloadLegal(data.path);

    return data;
  },
  head: () =>
    seo({
      title: "Privacy policy",
      description: `What ${site.name} collects when you visit, and what it does not.`,
      path: "/privacy",
      image: { url: siteImageUrl("home"), alt: `${site.name}: ${site.tagline}` },
    }),
  component: Page,
});

function Page() {
  return <LegalPage data={Route.useLoaderData()} />;
}
