import { PostHog } from "posthog-node";

import { analyticsConfig } from "./config";

// Server only: imported dynamically from request handlers.

/**
 * Agent reads (Markdown pages, llms.txt) never run browser JavaScript, so they are counted here.
 * Only production on Vercel sends; elsewhere these calls do nothing.
 */

const enabled = analyticsConfig.key !== "" && process.env.VERCEL_ENV === "production";

let client: PostHog | undefined;

function getClient() {
  if (!enabled) return undefined;

  // Serverless functions can freeze after responding, so events go out immediately.
  client ??= new PostHog(analyticsConfig.key, {
    host: analyticsConfig.host,
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

export type AgentContentKind = "md" | "llms" | "llms_full" | "negotiated";

const agents: readonly (readonly [RegExp, string])[] = [
  [/claude|anthropic/i, "claude"],
  [/chatgpt|gptbot|oai-searchbot|openai/i, "chatgpt"],
  [/perplexity/i, "perplexity"],
  [/cursor/i, "cursor"],
  [/gemini|google-extended|googleother/i, "gemini"],
  [/copilot|github/i, "copilot"],
  [/bytespider|ccbot|amazonbot|applebot|bingbot|googlebot/i, "crawler"],
  [/curl|wget|httpie|python-requests|node-fetch|undici|axios|go-http/i, "tool"],
];

const sectionOf = (path: string) =>
  path.startsWith("/blog")
    ? "blog"
    : path.startsWith("/docs")
      ? "docs"
      : path.startsWith("/llms")
        ? "llms"
        : "landing";

const agentOf = (userAgent: string) =>
  agents.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "other";

/** Counts an agent reading the docs as text. Waits at most a second so a slow send never holds a response. */
export async function trackAgentContent(request: Request, kind: AgentContentKind) {
  const posthog = getClient();
  const url = new URL(request.url);

  // Prerendering at build time requests pages from a local server; those are not reads.
  if (!posthog || url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  const userAgent = request.headers.get("user-agent") ?? "";
  const agent = agentOf(userAgent);

  const send = posthog.captureImmediate({
    // One anonymous id per agent family: counts reads, never people.
    distinctId: `agent:${agent}`,
    event: "agent_content_fetched",
    properties: {
      path: url.pathname,
      site_section: sectionOf(url.pathname),
      kind,
      agent,
      user_agent: userAgent.slice(0, 200),
      $process_person_profile: false,
    },
  });

  await Promise.race([send, new Promise((resolve) => setTimeout(resolve, 1000))]).catch(() => {});
}
