import { useEffect, useRef } from "react";

import { useLocation } from "@tanstack/react-router";

import { setDocsPageContext, track } from "@/lib/analytics/client";
import type { DocKind } from "@/lib/analytics/docs-page";
import { getPackageFromUrl } from "@/lib/packages";
import { docsRoute } from "@/lib/shared";

/** The docs path without the `/docs/` prefix, e.g. `sdk/getting-started`. */
export function useDocsSlug() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return pathname.replace(`${docsRoute}/`, "").replace(/\/$/, "");
}

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);

/**
 * Page view of one docs page, the page context every later event carries, and tab switches in
 * its content. Mount it where the page content mounts.
 */
export function DocsPageAnalytics({
  packageSlug,
  title,
  docKind,
  apiName,
}: {
  packageSlug: string;
  title: string;
  docKind: DocKind;
  apiName: string | undefined;
}) {
  const slug = useDocsSlug();
  const viewed = useRef<string>(undefined);

  useEffect(() => {
    if (viewed.current === slug) return;
    viewed.current = slug;

    setDocsPageContext({ path: `${docsRoute}/${slug}`, docKind, apiName });
    track("docs_page_viewed", {
      package: packageSlug,
      slug,
      title,
      doc_kind: docKind,
      ...(apiName === undefined ? {} : { api_name: apiName }),
    });
  }, [slug, packageSlug, title, docKind, apiName]);

  // Tabs come from Fumadocs (`<Tabs>` and install blocks), so one delegated listener reads them.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;

      const tab = event.target.closest('#nd-page [role="tab"]');
      const list = tab?.closest('[role="tablist"]');
      if (!tab || !list || tab.getAttribute("aria-selected") === "true") return;

      const labels = [...list.querySelectorAll('[role="tab"]')].map((item) =>
        (item.textContent ?? "").trim(),
      );
      const from = list.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? "";

      track("docs_tab_switched", {
        slug,
        group: labels.includes("Effect")
          ? "api"
          : labels.every((label) => PACKAGE_MANAGERS.has(label))
            ? "package_manager"
            : "other",
        from: from.trim(),
        to: (tab.textContent ?? "").trim(),
      });
    };

    document.addEventListener("click", onClick, true);

    return () => document.removeEventListener("click", onClick, true);
  }, [slug]);

  return null;
}

const VIEW_OPTION_HOSTS: Record<string, string> = {
  "scira.ai": "scira",
  "chatgpt.com": "chatgpt",
  "claude.ai": "claude",
  "cursor.com": "cursor",
};

function viewOption(link: HTMLAnchorElement) {
  const url = new URL(link.href, window.location.href);

  if (url.host === "github.com" && url.pathname.includes("/blob/")) return "github";
  if (url.origin === window.location.origin && url.pathname.endsWith(".md")) return "markdown";

  return VIEW_OPTION_HOSTS[url.host];
}

let lastPackage: string | undefined;

/**
 * Clicks inside the Fumadocs chrome (contents list, "Open" menu) and package
 * switches. The markup is not ours, so one delegated listener reads it instead of wrapping it.
 */
export function DocsChromeAnalytics() {
  const slug = useDocsSlug();
  const pathname = useLocation({ select: (location) => location.pathname });
  const slugRef = useRef(slug);

  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

  const current = getPackageFromUrl(pathname)?.slug;

  useEffect(() => {
    if (current === undefined) return;
    if (lastPackage !== undefined && lastPackage !== current) {
      track("docs_package_switched", { from: lastPackage, to: current });
    }

    lastPackage = current;
  }, [current]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest("a");
      if (!link || link.closest("article")) return;

      const href = link.getAttribute("href") ?? "";

      if (href.startsWith("#") && !link.closest("#nd-sidebar")) {
        track("docs_toc_clicked", {
          slug: slugRef.current,
          heading: (link.textContent ?? "").trim().slice(0, 100),
        });
        return;
      }

      const option = viewOption(link);
      if (option && link.target === "_blank") {
        track("docs_view_option_clicked", { option, slug: slugRef.current });
      }
    };

    document.addEventListener("click", onClick, true);

    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
