import { createFileRoute } from "@tanstack/react-router";

import { site } from "@/lib/site";

export const Route = createFileRoute("/site.webmanifest")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            name: `${site.name}: ${site.tagline}`,
            short_name: site.name,
            description: site.description,
            id: "/",
            start_url: "/",
            scope: "/",
            display: "standalone",
            lang: "en",
            background_color: site.themeColor,
            theme_color: site.themeColor,
            icons: [
              { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
              {
                src: "/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
              },
            ],
          },
          { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } },
        ),
    },
  },
});
