import { useMemo, useState } from "react";

import { Link } from "fumadocs-core/link";
import { Search } from "lucide-react";

import reference from "@/content/reference.json";

type Entry = { readonly name: string; readonly url: string; readonly summary: string };

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Substring first, then the letters of the query in order (`gaddr` finds `getAddress`). */
function matches(text: string, query: string) {
  const haystack = normalize(text);
  if (haystack.includes(query)) return true;

  let index = 0;
  for (const character of haystack) if (character === query[index]) index += 1;

  return index === query.length;
}

/** Items shown under a card while filtering; the card links to the rest. */
const shownItems = 6;

/**
 * The reference landing: a filter over every package card and its items (actions, hooks, codes),
 * after effect.website's API index. Counts come from the generator (`reference.json`).
 */
export default function ReferenceHome() {
  const [query, setQuery] = useState("");
  const needle = normalize(query);

  const results = useMemo(
    () =>
      reference.packages.flatMap((pkg) => {
        if (needle === "") return [{ pkg, items: [] as readonly Entry[] }];

        const items = pkg.items.filter((item) => matches(item.name, needle));
        const cardMatches = matches(`${pkg.name} ${pkg.npm ?? ""}`, needle);

        return cardMatches || items.length > 0 ? [{ pkg, items }] : [];
      }),
    [needle],
  );

  return (
    <div className="not-prose flex flex-col gap-6">
      <label className="relative block">
        <span className="sr-only">Search the reference</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fd-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the reference"
          className="w-full rounded-lg border bg-transparent py-2.5 pr-4 pl-11 font-mono text-sm outline-none placeholder:text-fd-muted-foreground focus:border-ek-accent"
        />
      </label>

      {results.length === 0 ? (
        <p className="text-sm text-fd-muted-foreground">No matching packages or items.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map(({ pkg, items }) => (
            <div
              key={pkg.slug}
              data-accent={pkg.slug}
              className="group relative rounded-lg border bg-fd-card/40 p-4 transition-colors focus-within:ring-2 focus-within:ring-fd-ring hover:border-ek-accent/60 hover:bg-fd-muted/70"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={pkg.url}
                  className="truncate font-mono text-sm font-semibold outline-none after:absolute after:inset-0 group-hover:text-ek-accent"
                >
                  {pkg.name}
                </Link>
                <span className="shrink-0 font-mono text-xs text-fd-muted-foreground">
                  {pkg.count} {pkg.unit}
                </span>
              </div>
              {pkg.npm ? (
                <p className="mt-0.5 font-mono text-xs text-fd-muted-foreground">{pkg.npm}</p>
              ) : null}
              <p className="mt-2 line-clamp-2 text-sm text-fd-muted-foreground">
                {pkg.description}
              </p>
              {items.length > 0 ? (
                <ul className="relative z-10 mt-3 flex flex-col gap-1 border-t pt-3">
                  {items.slice(0, shownItems).map((item) => (
                    <li key={item.url} className="min-w-0">
                      <Link
                        href={item.url}
                        title={item.summary}
                        className="block truncate font-mono text-xs hover:text-ek-accent"
                      >
                        {item.name}
                        <span className="ms-2 font-sans text-fd-muted-foreground">
                          {item.summary}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {items.length > shownItems ? (
                    <li className="font-mono text-xs text-fd-muted-foreground">
                      {items.length - shownItems} more in {pkg.name}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
