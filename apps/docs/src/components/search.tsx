import { useEffect, useRef, useState } from "react";

import { useLocation } from "@tanstack/react-router";

import { useDocsSearch } from "fumadocs-core/search/client";
import { fetchClient } from "fumadocs-core/search/client/fetch";
import { useOnChange } from "fumadocs-core/utils/use-on-change";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
  TagsList,
  TagsListItem,
} from "fumadocs-ui/components/dialog/search";

import { track } from "@/lib/analytics/client";
import { documentedPackages, getPackageFromUrl } from "@/lib/packages";

/**
 * Search scoped to the package being read; readers can widen it to all packages.
 * Outside a package (e.g. the home page) every package is searched.
 *
 * Guides are searched by default. The API reference (hundreds of generated action, hook and
 * error pages) is searched only when the reader switches to it, so everyday results stay focused.
 *
 * The footer sits inside `SearchDialogContent` so it's portaled with the popup
 * (the stock dialog renders it outside, which leaks it onto the page with Base UI).
 */
export default function PackageSearchDialog(props: SharedProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = getPackageFromUrl(pathname)?.slug;

  const [tag, setTag] = useState(current);
  useOnChange(current, setTag);
  const [kind, setKind] = useState<"guides" | "reference">("guides");

  const search = useDocsSearch({
    client: fetchClient({ tag: tag === undefined ? [kind] : [tag, kind] }),
  });
  const scope = `${tag ?? "all"}:${kind}`;

  useSearchAnalytics(props.open, scope, search);

  return (
    <SearchDialog
      {...search}
      {...props}
      onSelect={(item) => {
        const rank = rankOf(search.data, item);
        if (rank > 0 && "url" in item) {
          track("docs_search_result_clicked", {
            result_url: item.url,
            rank,
            query_length: search.search.trim().length,
          });
        }
      }}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput data-ph-mask className="ph-no-capture" />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
        <SearchDialogFooter className="flex flex-row items-center justify-between gap-3">
          <TagsList {...(tag === undefined ? {} : { tag })} onTagChange={setTag} allowClear>
            {documentedPackages.map((pkg) => (
              <TagsListItem key={pkg.slug} value={pkg.slug}>
                {pkg.name}
              </TagsListItem>
            ))}
          </TagsList>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-fd-muted-foreground select-none hover:text-fd-foreground">
            <input
              type="checkbox"
              className="size-3.5 cursor-pointer accent-fd-primary"
              checked={kind === "reference"}
              onChange={(event) => setKind(event.target.checked ? "reference" : "guides")}
            />
            API reference
          </label>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}

type Results = ReturnType<typeof useDocsSearch>["data"];

const flatten = (data: Results) =>
  (data?.items ?? []).flatMap((item) => (item.type === "table" ? item.rows : [item]));

/** 1-based position of a chosen result in the list, 0 when it is not a result. */
function rankOf(data: Results, item: SearchItemType) {
  return flatten(data).findIndex((result) => result.id === item.id) + 1;
}

const HOTKEY_WINDOW_MS = 400;

function useSearchAnalytics(
  open: boolean,
  scope: string,
  search: ReturnType<typeof useDocsSearch>,
) {
  const lastHotkey = useRef(0);
  const wasOpen = useRef(false);
  const sent = useRef<string>(undefined);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        lastHotkey.current = Date.now();
      }
    };

    window.addEventListener("keydown", onKey, true);

    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const hotkey = Date.now() - lastHotkey.current < HOTKEY_WINDOW_MS;
      track("docs_search_opened", { trigger: hotkey ? "hotkey" : "button", package: scope });
    }

    if (!open) sent.current = undefined;
    wasOpen.current = open;
  }, [open, scope]);

  const { data, isLoading } = search;
  const typed = search.search;

  useEffect(() => {
    const query = typed.trim();
    // Wait for the results of this query; `data` still holds the previous query's while loading.
    if (!open || query.length < 2 || isLoading || data?.query !== typed) return undefined;

    const key = `${scope}:${query}`;
    if (sent.current === key) return undefined;

    const timer = window.setTimeout(() => {
      sent.current = key;
      track("docs_search_performed", {
        query,
        query_length: query.length,
        result_count: flatten(data).length,
        package: scope,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [open, scope, typed, data, isLoading]);
}
