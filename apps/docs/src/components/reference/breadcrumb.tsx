import { Fragment } from "react";

import { getBreadcrumbItemsFromPath } from "fumadocs-core/breadcrumb";
import { Link } from "fumadocs-core/link";
import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";

import { cn } from "@/lib/cn";

/**
 * Breadcrumbs of reference pages, after effect.website's: `Reference / Errors / WalletError /
 * CHAIN_MISMATCH`. Fumadocs' own starts below the root folder and leaves out the page.
 */
export function ReferenceBreadcrumb({ className }: { className?: string | undefined }) {
  const path = useTreePath();
  const { full } = useTreeContext();
  const items = [
    { name: "Reference", url: "/docs/reference" },
    ...getBreadcrumbItemsFromPath(full, path, { includePage: true }),
  ];
  // The landing page is the root itself.
  if (items.at(-1)?.url === "/docs/reference") return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1.5 font-mono text-xs text-fd-muted-foreground",
        className,
      )}
    >
      {items.map((item, index) => (
        <Fragment key={`${typeof item.name === "string" ? item.name : ""}${item.url ?? ""}`}>
          {index > 0 ? <span className="shrink-0 text-fd-muted-foreground/50">/</span> : null}
          {item.url && index < items.length - 1 ? (
            <Link href={item.url} className="truncate transition-colors hover:text-fd-foreground">
              {item.name}
            </Link>
          ) : (
            <span className={cn("truncate", index === items.length - 1 && "text-fd-foreground")}>
              {item.name}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
