import { readdirSync } from "node:fs";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import posthog from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Package docs are only linked from the picker popover, so seed the crawler with each one,
// along with their Markdown versions for agents.
const packageDocs = readdirSync("content/docs", { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? [{ path: `/docs/${entry.name}` }, { path: `/docs/${entry.name}.md` }] : [],
);

// The deploy's git SHA (the Docker build's GIT_SHA) ties analytics events and error stack traces
// to a release.
const release = (process.env.GIT_SHA ?? "dev").slice(0, 12);

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
  // Prerendering requests the preview server at 127.0.0.1; bound to `localhost`, it can listen on
  // ::1 only (as in the Docker build), and every prerender request is refused.
  preview: {
    host: "127.0.0.1",
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
        { path: "/llms-full.txt" },
      ],
    }),
    // A Node server (`.output/server/index.mjs`) for the Docker image in apps/docs/Dockerfile.
    nitro({
      preset: "node-server",
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
