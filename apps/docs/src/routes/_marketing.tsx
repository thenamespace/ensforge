import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";
import { RevealObserver } from "@/components/marketing/reveal";
import { InSiteFrame } from "@/components/marketing/site-frame";

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <div className="flex min-h-screen flex-col bg-fd-background">
      <MarketingNav />
      <main className="flex-1">
        <InSiteFrame value={true}>
          <Outlet />
        </InSiteFrame>
      </main>
      <MarketingFooter />
      <RevealObserver key={pathname} />
    </div>
  );
}
