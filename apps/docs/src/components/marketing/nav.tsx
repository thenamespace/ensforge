import { useEffect, useState } from "react";

import { Link } from "@tanstack/react-router";

import { GitHubIcon } from "@/components/icons/github-icon";
import { EnsforgeLogo } from "@/components/logos";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

import { Container } from "./section";

const link =
  "rounded-md px-1.5 py-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring sm:px-3";

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);

    // Sync once on mount so a reload mid-page starts with the solid header.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled ? "border-(--ek-line) bg-fd-background/95" : "border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-15 items-center justify-between gap-3">
        <Link
          to="/"
          title={`${site.name} home`}
          onClick={() => track("nav_link_clicked", { location: "header", target: "home" })}
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fd-ring"
          aria-label={`${site.name} home`}
        >
          <EnsforgeLogo className="size-6" />
          <span className="font-semibold whitespace-nowrap">{site.name}</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link
            to="/docs"
            title="Documentation"
            className={link}
            onClick={() => track("nav_link_clicked", { location: "header", target: "docs" })}
          >
            Docs
          </Link>
          <Link
            to="/blog"
            title="Blog"
            className={cn(link, "data-[status=active]:text-fd-foreground")}
            onClick={() => track("nav_link_clicked", { location: "header", target: "blog" })}
          >
            Blog
          </Link>
          <a
            href={site.github}
            title={`${site.name} on GitHub`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${site.name} on GitHub`}
            onClick={() =>
              track("outbound_link_clicked", {
                destination: site.github,
                host: "github.com",
                location: "header",
              })
            }
            className="grid size-10 place-items-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring"
          >
            <GitHubIcon className="size-4.5" />
          </a>
        </nav>
      </Container>
    </header>
  );
}
