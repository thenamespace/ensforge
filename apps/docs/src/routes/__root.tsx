import { type ReactNode, useEffect } from "react";

import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

import { RootProvider } from "fumadocs-ui/provider/tanstack";

import SearchDialog from "@/components/search";
import { startAnalytics } from "@/lib/analytics/client";
import { getPackageFromUrl } from "@/lib/packages";
import { pageTitle } from "@/lib/seo";
import { docsRoute } from "@/lib/shared";
import { absolute, site } from "@/lib/site";

import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
  // Pages change with each deploy; let caches revalidate instead of holding them for long.
  headers: () => ({ "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate" }),
  head: ({ matches }) => {
    // Child routes override these by name; a 404 or failed route sets none, so these stand.
    // A URL no route matches leaves the root as the only match; a loader can also throw notFound.
    const missing = matches.length === 1 || matches.some((match) => match.status === "notFound");
    const failed = matches.some((match) => match.status === "error");

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: site.themeColor },
        { name: "color-scheme", content: "dark" },
        { name: "application-name", content: site.name },
        { name: "apple-mobile-web-app-title", content: site.name },
        { name: "format-detection", content: "telephone=no" },
        { name: "generator", content: "TanStack Start" },
        {
          title: missing
            ? pageTitle("Page not found")
            : failed
              ? pageTitle("Something went wrong")
              : pageTitle(),
        },
        { name: "description", content: site.description },
        { name: "keywords", content: site.keywords.join(", ") },
        { name: "author", content: site.publisher },
        { name: "publisher", content: site.publisher },
        ...(missing || failed ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
        ...(site.blogEnabled
          ? [
              {
                rel: "alternate",
                type: "application/rss+xml",
                title: `${site.name} blog`,
                href: absolute("/blog/rss.xml"),
              },
            ]
          : []),
        { rel: "me", href: site.github },
      ],
    };
  },
  component: RootComponent,
});

// The site is dark only: no system preference, no switch and no `d` hotkey.
const theme = {
  forcedTheme: "dark",
  defaultTheme: "dark",
  enableSystem: false,
  hotKey: false,
} as const;
const search = { SearchDialog } as const;

function RootDocument({ children }: { children: ReactNode }) {
  // Docs take their package's accent. It sits on <html> rather than the layout so the search
  // dialog and popovers, which render in portals, pick it up too.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isDocs = pathname === docsRoute || pathname.startsWith(`${docsRoute}/`);
  const accent = isDocs ? getPackageFromUrl(pathname)?.slug : undefined;

  useEffect(startAnalytics, []);

  return (
    <html
      lang="en"
      className="dark"
      style={{ colorScheme: "dark" }}
      data-docs={isDocs ? "" : undefined}
      data-accent={accent}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* For agents: where the plain-text docs live. Hidden from sighted readers only. */}
        <p className="sr-only">
          Documentation for agents: an index at <a href="/llms.txt">/llms.txt</a>, every docs page
          in one file at <a href="/llms-full.txt">/llms-full.txt</a>, and Markdown for any docs page
          by adding .md to its URL.
        </p>
        <RootProvider theme={theme} search={search}>
          {children}
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}
