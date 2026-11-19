import { createMiddleware } from "@tanstack/react-start";

/**
 * Compresses every response the app renders (pages, server function results, Markdown and text
 * routes) with brotli or gzip. Nitro serves the built assets precompressed on its own.
 */
export const compression = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const { compress } = await import("./compression.server");
    const { response } = await next();

    return compress(request, response);
  },
);

/** Answers with the build's prerendered HTML when a page has one, instead of rendering it again. */
export const prerenderedPages = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const { prerenderedPage } = await import("./prerendered.server");

    return (await prerenderedPage(request)) ?? next();
  },
);
