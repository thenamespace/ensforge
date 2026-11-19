import { Actions, Ensforge, Errors } from "@ensforge/sdk";
import { http } from "viem";
import { mainnet } from "viem/chains";

import type { Chain, ExampleId, ResultView, RunOutcome, SocialRecord } from "./examples";

/**
 * The playground's SDK runtime, loaded with a dynamic import the first time the playground is
 * on screen, so the SDK, viem and Effect stay out of the page's bundle. One client for the page,
 * a public CORS-friendly RPC, results cached per input and runs spaced out so a reader clicking
 * fast cannot flood the endpoint.
 */

const RPC_URL = `https://rpc.namespace.ninja/rpc/${mainnet.id}`;
/** Minimum gap between two runs that reach the network. */
const SPACING_MS = 1200;
/** Network runs per page view; past it the playground asks for a reload. */
const MAX_RUNS = 40;

let sentRequests = 0;

const ens = Ensforge.create({
  chain: mainnet,
  transports: {
    [mainnet.id]: http(RPC_URL, {
      batch: { wait: 16 },
      retryCount: 1,
      timeout: 15_000,
      onFetchRequest: () => {
        sentRequests += 1;
      },
    }),
  },
});

const coins = { eth: "eth", btc: "btc", base: { chainId: 8453 } } as const;

const jsonSafe = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  );

const socialLinks: Record<string, { label: string; href?: (value: string) => string }> = {
  url: { label: "Website", href: (value) => value },
  "com.github": { label: "GitHub", href: (value) => `https://github.com/${value}` },
  "com.twitter": { label: "X", href: (value) => `https://x.com/${value}` },
  "org.telegram": { label: "Telegram", href: (value) => `https://t.me/${value}` },
  "com.discord": { label: "Discord" },
  email: { label: "Email", href: (value) => `mailto:${value}` },
};

const profileTexts = ["description", ...Object.keys(socialLinks)];

/** Only http(s) links are rendered, whatever a record holds. */
const safeHref = (href: string) => (/^(https?:|mailto:)/i.test(href) ? href : undefined);

const expiryDate = (seconds: bigint | null) =>
  seconds === null ? "never" : new Date(Number(seconds) * 1000).toISOString().slice(0, 10);

async function read(
  id: ExampleId,
  input: string,
  chain: Chain,
): Promise<{ json: unknown; view: ResultView }> {
  switch (id) {
    case "profile": {
      const [state, records, avatar] = await Promise.all([
        Actions.name.get(ens, { name: input }),
        Actions.record.get(ens, { name: input, texts: profileTexts, addresses: ["eth"] }),
        Actions.record.getAvatar(ens, { name: input }),
      ]);
      const texts: Readonly<Record<string, string | null>> = records.texts;
      const socials: SocialRecord[] = Object.entries(socialLinks).flatMap(([key, link]) => {
        const value = texts[key];
        if (!value) return [];
        const href = link.href ? safeHref(link.href(value)) : undefined;

        return [{ key, label: link.label, value, ...(href ? { href } : {}) }];
      });

      return {
        json: jsonSafe({ name: state, records, avatar }),
        view: {
          kind: "profile",
          name: state.name,
          avatar,
          description: texts.description ?? null,
          address: records.addresses.eth,
          socials,
          facts: [
            { label: "Protocol", value: `ENS${state.protocol}` },
            { label: "Status", value: state.status },
            { label: "Expires", value: expiryDate(state.expiry) },
          ],
        },
      };
    }
    case "address": {
      const address = await Actions.record.getAddress(ens, { name: input, coin: coins[chain] });

      return { json: address, view: { kind: "address", name: input, chain, address } };
    }
    case "primaryName": {
      const name = await Actions.primaryName.get(ens, { address: input });

      return { json: name, view: { kind: "primaryName", address: input, chain, name } };
    }
    case "avatar": {
      const url = await Actions.record.getAvatar(ens, { name: input });

      return { json: url, view: { kind: "avatar", name: input, url } };
    }
    // "batch", the last tab.
    default: {
      const { results } = await Actions.batch(ens, {
        requests: {
          address: Actions.record.getAddress.request({ name: input }),
          avatar: Actions.record.getAvatar.request({ name: input }),
          url: Actions.record.getText.request({ name: input, key: "url" }),
          state: Actions.name.get.request({ name: input }),
        },
      });
      const rows = Object.entries(results).map(([key, result]) => {
        if (result.status === "failure") {
          return { key, ok: false, value: Errors.is(result.error) ? result.error.code : "failed" };
        }
        const value = result.result;
        const shown =
          value === null
            ? "null"
            : typeof value === "string"
              ? value
              : `${value.status} · ENS${value.protocol}`;

        return { key, ok: true, value: shown };
      });

      return { json: jsonSafe({ results }), view: { kind: "batch", name: input, rows } };
    }
  }
}

const cache = new Map<string, Extract<RunOutcome, { ok: true }>>();
let lastRunAt = 0;
let runs = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one tab's read, from the cache when this exact input already succeeded. */
export async function run(id: ExampleId, input: string, chain: Chain): Promise<RunOutcome> {
  const key = `${id}:${chain}:${input.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, requests: 0, cached: true, ms: 0 };

  const started = performance.now();

  if (runs >= MAX_RUNS) {
    return {
      ok: false,
      code: "PLAYGROUND_LIMIT",
      title: "That's a lot of lookups",
      message: "The playground shares a public RPC. Reload the page to keep going.",
      docs: undefined,
      json: null,
      ms: 0,
    };
  }

  const gap = lastRunAt + SPACING_MS - Date.now();
  if (gap > 0) await wait(gap);
  lastRunAt = Date.now();
  runs += 1;

  const before = sentRequests;

  try {
    const { json, view } = await read(id, input.trim(), chain);
    const outcome = {
      ok: true as const,
      json,
      view,
      ms: performance.now() - started,
      requests: sentRequests - before,
      cached: false,
    };
    cache.set(key, outcome);

    return outcome;
  } catch (error) {
    const copy = Errors.describe(error);
    const typed = Errors.is(error) ? error : undefined;

    return {
      ok: false,
      code: copy.code,
      title: copy.title,
      message: copy.action ? `${copy.message} ${copy.action}` : copy.message,
      docs: typed ? `/docs/reference/errors/${typed.code}` : undefined,
      json: typed
        ? { _tag: typed._tag, code: typed.code, shortMessage: typed.shortMessage }
        : { error: String(error) },
      ms: performance.now() - started,
    };
  }
}
