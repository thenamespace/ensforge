import { usePathname } from "fumadocs-core/framework";
import { Link } from "fumadocs-core/link";

import { cn } from "@/lib/cn";

const referenceRoute = "/docs/reference";

/** The Guides / Reference switch at the top of the docs sidebar. */
export function SectionTabs() {
  const pathname = usePathname();
  const isReference = pathname === referenceRoute || pathname.startsWith(`${referenceRoute}/`);
  const tabs = [
    { label: "Guides", href: "/docs", active: !isReference },
    { label: "Reference", href: referenceRoute, active: isReference },
  ];

  return (
    <nav
      aria-label="Docs sections"
      className="mb-4 grid grid-cols-2 gap-1 rounded-xl border bg-fd-secondary/50 p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors",
            tab.active
              ? "bg-fd-background text-fd-foreground shadow-sm ring-1 ring-fd-border"
              : "text-fd-muted-foreground hover:text-fd-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
