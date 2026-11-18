import type { ReactNode } from "react";

import { OG } from "./templates";

/** Renders an OG image as PNG, cached hard: the URL changes whenever its input does. */
export async function ogResponse(node: ReactNode) {
  // Takumi loads a native binary, so it is imported on first render rather than with the
  // route tree: if the binary fails to load, only the OG routes fail, not the whole server.
  const [{ ImageResponse }, { getRenderer }] = await Promise.all([
    import("takumi-js/response"),
    import("./fonts"),
  ]);
  const renderer = await getRenderer();

  return new ImageResponse(node, {
    renderer,
    width: OG.width,
    height: OG.height,
    format: "png",
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
