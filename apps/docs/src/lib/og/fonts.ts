// Inlined into the server bundle so the fonts ship with the serverless function; a runtime
// file read would point at node_modules, which deployments don't include.
import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline";
import mono from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline";
import { Renderer } from "takumi-js/node";

const bytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

let renderer: Promise<Renderer> | undefined;

/** One renderer per server, with the site's own typefaces registered (Inter, JetBrains Mono). */
export function getRenderer() {
  renderer ??= (async () => {
    const instance = new Renderer();

    await instance.registerFont({ name: "Inter", data: bytes(inter) });
    await instance.registerFont({ name: "JetBrains Mono", data: bytes(mono) });

    return instance;
  })();

  return renderer;
}
