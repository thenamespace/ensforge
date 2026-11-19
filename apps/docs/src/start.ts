import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { compression, prerenderedPages } from "@/lib/delivery";
import { markdownNegotiation } from "@/lib/markdown-negotiation";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  // Compression wraps everything; Markdown negotiation runs before prerendered HTML so agents
  // asking for `text/markdown` still get Markdown.
  requestMiddleware: [compression, markdownNegotiation, prerenderedPages, csrfMiddleware],
}));
