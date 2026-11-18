import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { markdownNegotiation } from "@/lib/markdown-negotiation";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [markdownNegotiation, csrfMiddleware],
}));
