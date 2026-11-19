import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

// Server only: imported dynamically from the prerendered-pages middleware.

/** Same caching as rendered pages (`__root.tsx`): shared caches keep them for an hour. */
const CACHE_CONTROL = "public, max-age=0, s-maxage=3600, must-revalidate";

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

interface Page {
  readonly br: Buffer;
  readonly gzip: Buffer;
  readonly etag: string;
}

/**
 * The build prerenders pages into `.output/public/<path>/index.html` after Nitro has listed its
 * static files, so Nitro never serves them and every request rendered the page again. This
 * serves them from disk instead, compressed once per page (off the event loop) and kept in
 * memory. Brotli quality 9 takes milliseconds where 11 takes about 200 ms per page, for about
 * 10% more bytes. The server entry
 * is `.output/server/index.mjs`, so the files sit in `../public` beside it.
 */
const publicDir = join(dirname(process.argv[1] ?? ""), "..", "public");

let prerendered: Promise<Set<string>> | undefined;
const pages = new Map<string, Promise<Page>>();

/** URL paths that have a prerendered `index.html`, read once. */
async function listPrerendered(): Promise<Set<string>> {
  const files = await readdir(publicDir, { recursive: true }).catch(() => []);

  return new Set(
    files
      .filter((file) => file === "index.html" || file.endsWith("/index.html"))
      .map((file) => `/${file.slice(0, -"index.html".length)}`.replace(/(.)\/$/, "$1")),
  );
}

const htmlOf = (path: string) => readFile(join(publicDir, path, "index.html"));

async function loadPage(path: string): Promise<Page> {
  const html = await htmlOf(path);
  const [br, gzipped] = await Promise.all([
    brotliAsync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
    gzipAsync(html, { level: 9 }),
  ]);

  return { br, gzip: gzipped, etag: `"${createHash("sha1").update(html).digest("base64url")}"` };
}

function preferredEncoding(request: Request): "br" | "gzip" | undefined {
  const accepted = request.headers.get("accept-encoding") ?? "";

  if (/\bbr\b/.test(accepted)) return "br";
  if (/\bgzip\b/.test(accepted)) return "gzip";

  return undefined;
}

/** The prerendered page for a GET or HEAD request, or `undefined` to render it as usual. */
export async function prerenderedPage(request: Request): Promise<Response | undefined> {
  // Development has no build output to serve.
  if (!import.meta.env.PROD || (request.method !== "GET" && request.method !== "HEAD"))
    return undefined;

  const { pathname } = new URL(request.url);
  prerendered ??= listPrerendered();
  if (!(await prerendered).has(pathname)) return undefined;

  let page = pages.get(pathname);
  if (!page) {
    page = loadPage(pathname);
    pages.set(pathname, page);
  }
  const { br, gzip: gzipped, etag } = await page;

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": CACHE_CONTROL,
    etag,
    vary: "Accept-Encoding",
  });
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });

  const encoding = preferredEncoding(request);
  // Clients without compression are rare (tools, some crawlers): read the file again for them.
  const body = encoding === "br" ? br : encoding === "gzip" ? gzipped : await htmlOf(pathname);
  if (encoding) headers.set("content-encoding", encoding);
  headers.set("content-length", String(body.byteLength));

  return new Response(request.method === "HEAD" ? null : new Uint8Array(body), { headers });
}
