import { AnchorProvider, type TableOfContents, useActiveAnchor } from "fumadocs-core/toc";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

function Items({ toc, slug }: { readonly toc: TableOfContents; readonly slug: string }) {
  const active = useActiveAnchor();

  return (
    <ul className="flex flex-col border-l border-(--ek-line)">
      {toc.map((item) => {
        const id = item.url.slice(1);
        const isActive = active === id;

        return (
          <li key={item.url}>
            <a
              href={item.url}
              onClick={(event) =>
                track("blog_toc_clicked", {
                  slug,
                  heading: (event.currentTarget.textContent ?? "").slice(0, 80),
                })
              }
              className={cn(
                "-ml-px block border-l py-1.5 text-[13px] leading-snug transition-colors",
                item.depth > 2 ? "pl-7" : "pl-4",
                isActive
                  ? "border-ek-accent text-fd-foreground"
                  : "border-transparent text-fd-muted-foreground hover:text-fd-foreground",
              )}
            >
              {item.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** "On this page" for a post, following the heading in view. Only h2 and h3. */
export function PostToc({ toc, slug }: { readonly toc: TableOfContents; readonly slug: string }) {
  const items = toc.filter((item) => item.depth >= 2 && item.depth <= 3);
  if (items.length < 2) return null;

  return (
    <AnchorProvider toc={items} single>
      <nav aria-label="On this page" className="flex flex-col gap-3">
        <p className="font-mono text-xs text-fd-muted-foreground">On this page</p>
        <Items toc={items} slug={slug} />
      </nav>
    </AnchorProvider>
  );
}
