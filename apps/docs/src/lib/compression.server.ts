// Server only: imported dynamically from the compression middleware.

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|x-tss|x-ndjson)|image\/svg)/;

/**
 * Gzips a rendered page, server function result or text route on the fly (the web
 * `CompressionStream` has no brotli quality setting, and brotli's default is too slow per
 * request). Static assets and prerendered pages are brotli-compressed ahead of time instead and
 * arrive here already encoded.
 */
export function compress(request: Request, response: Response): Response {
  const type = response.headers.get("content-type") ?? "";

  if (
    !/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "") ||
    !response.body ||
    response.headers.has("content-encoding") ||
    !COMPRESSIBLE.test(type)
  ) {
    return response;
  }

  const body = response.body.pipeThrough(new CompressionStream("gzip"));

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-encoding", "gzip");
  headers.append("vary", "Accept-Encoding");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
