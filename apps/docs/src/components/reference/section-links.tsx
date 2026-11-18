import { usePathname } from "fumadocs-core/framework";
import { Link } from "fumadocs-core/link";

import { cn } from "@/lib/cn";
import { docsIcon } from "@/lib/docs-icons";
import { getPackageFromUrl } from "@/lib/packages";
import { site } from "@/lib/site";

const referenceRoute = "/docs/reference";

/** Guides and API reference links at the top of the docs sidebar. */
export function SectionLinks() {
  const pathname = usePathname();
  const isReference = pathname === referenceRoute || pathname.startsWith(`${referenceRoute}/`);
  const pkg = getPackageFromUrl(pathname);
  const links = [
    {
      label: "Guides",
      href: pkg ? `/docs/${pkg.slug}` : "/docs",
      icon: "guide",
      active: !isReference,
    },
    { label: "API reference", href: referenceRoute, icon: "reference", active: isReference },
  ] as const;

  return (
    // A rule closes the links. The sidebar gives its last link a 1.5rem bottom margin; without the
    // Blog link that is this wrapper, so take half of it back for a 0.75rem gap below the rule.
    // `docs-section-links` in app.css trims the first section label's top margin to match.
    <nav
      aria-label="Docs sections"
      className={cn(
        "docs-section-links flex flex-col border-b border-fd-border pb-3",
        !site.blogEnabled && "-mb-3",
      )}
    >
      {links.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          data-active={item.active}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-fd-ring [&_svg]:size-4 [&_svg]:shrink-0",
            item.active
              ? "bg-fd-primary/10 text-fd-primary"
              : "text-fd-muted-foreground hover:text-fd-accent-foreground",
          )}
        >
          {docsIcon(item.icon)}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
