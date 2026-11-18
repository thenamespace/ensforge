import type { AgentContentKind } from "./server";

/** Counts an agent reading a page as text. The PostHog server client loads only on the server. */
export async function countAgentRead(request: Request, kind: AgentContentKind) {
  const { trackAgentContent } = await import("./server");

  await trackAgentContent(request, kind);
}
