import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/marketing/legal-page";
import { loadLegal, preloadLegal } from "@/lib/legal";
import { siteImageUrl } from "@/lib/og/urls";
import { breadcrumbLd, pageTitle, seo, webPageLd } from "@/lib/seo";
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
      description:
        "What ensforge.com collects when you visit, and what it does not. No cookies or ads, analytics keep no IP address, and the packages send nothing to Namespace.",
      path: "/privacy",
      image: { url: siteImageUrl("home"), alt: `${site.name}: ${site.tagline}` },
      jsonLd: [
        webPageLd({
          name: pageTitle("Privacy policy"),
          description:
            "What ensforge.com collects when you visit, and what it does not. No cookies or ads, analytics keep no IP address, and the packages send nothing to Namespace.",
          path: "/privacy",
          image: siteImageUrl("home"),
        }),
        breadcrumbLd([
          { name: site.name, path: "/" },
          { name: "Privacy policy", path: "/privacy" },
        ]),
      ],
      keywords: ["privacy policy", "analytics", "cookies", "ensforge", "Namespace Inc."],
    }),
  component: Page,
});

function Page() {
  return <LegalPage data={Route.useLoaderData()} />;
}
