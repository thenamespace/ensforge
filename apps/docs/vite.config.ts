import { readdirSync } from "node:fs";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import posthog from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// On Vercel, prerendered pages are served as static files before the server runs, so the
// content-negotiation middleware never sees them. These routes send `Accept: text/markdown`
// requests to the prerendered `.md` version first.
const acceptsMarkdown = [{ type: "header", key: "accept", value: "(?:.*[,\\s])?text/markdown.*" }];
const markdownRoutes = [
  { src: "^/$", has: acceptsMarkdown, dest: "/index.md", headers: { Vary: "Accept" } },
  { src: "^/blog/?$", has: acceptsMarkdown, dest: "/blog.md", headers: { Vary: "Accept" } },
  {
    src: "^/blog/([a-z0-9-]+)/?$",
    has: acceptsMarkdown,
    dest: "/blog/$1.md",
    headers: { Vary: "Accept" },
  },
  {
    src: "^/docs/((?!.*\\.md$).+?)/?$",
    has: acceptsMarkdown,
    dest: "/docs/$1.md",
    headers: { Vary: "Accept" },
  },
];

// Package docs are only linked from the picker popover, so seed the crawler with each one,
// along with their Markdown versions for agents.
const packageDocs = readdirSync("content/docs", { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? [{ path: `/docs/${entry.name}` }, { path: `/docs/${entry.name}.md` }] : [],
);

// The deploy's git SHA ties analytics events and error stack traces to a release.
const release = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 12);

// Source maps go to PostHog error tracking only from builds that hold a personal API key and a
// project id; they are deleted after upload, so the site never serves them.
const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const sourceMaps =
  personalApiKey && projectId
    ? [
        posthog({
          personalApiKey,
          projectId,
          host: "https://us.posthog.com",
          sourcemaps: {
            enabled: true,
            releaseName: "ensforge-docs",
            releaseVersion: release,
            deleteAfterUpload: true,
          },
        }),
      ]
    : [];

export default defineConfig({
  define: {
    "import.meta.env.VITE_RELEASE": JSON.stringify(release),
  },
  server: {
    port: 3000,
  },
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // Changelogs read GitHub releases at request time so a release shows without a deploy.
        filter: (page) => !page.path.includes("/changelog"),
      },
      pages: [
        ...packageDocs,
        { path: "/sitemap.xml" },
        { path: "/robots.txt" },
        { path: "/llms.txt" },
        { path: "/index.md" },
        { path: "/blog" },
        { path: "/blog.md" },
        { path: "/blog/rss.xml" },
        { path: "/llms-full.txt" },
      ],
    }),
    // Nitro builds the server for the host it detects (Vercel when deployed there).
    nitro({
      vercel: { config: { version: 3, routes: markdownRoutes } },
      // Takumi stays an external, fully traced package so it loads its native binary at
      // runtime. Bundled, it pulls in the WASM build and the server fails to start.
      wasm: false,
      exportConditions: ["!unwasm"],
      rolldownConfig: { external: ["takumi-js/response", "takumi-js/node"] },
      traceDeps: ["takumi-js"],
    }),
    react(),
    ...sourceMaps,
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
