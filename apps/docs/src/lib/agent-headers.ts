/**
 * Cache policy for the text agents read (llms.txt, Markdown pages): short enough that updates
 * reach them within the hour, with revalidation instead of a long fixed lifetime.
 */
export const agentCacheControl = "public, max-age=300, s-maxage=3600, must-revalidate";

export const markdownHeaders = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": agentCacheControl,
  Vary: "Accept",
} as const;

export const textHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": agentCacheControl,
} as const;
