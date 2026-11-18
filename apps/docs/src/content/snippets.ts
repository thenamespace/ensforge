/**
 * Every code sample on the marketing pages, highlighted on the server by `highlightSnippets`
 * (and tokenized for Magic Move by `keyedSnippets`). Samples must use the packages' real APIs.
 * Placeholder: two samples (from the SDK README) until the landing page is written.
 */
interface Snippet {
  readonly lang: "ts" | "tsx" | "bash";
  readonly code: string;
}

const ts = (code: string): Snippet => ({ lang: "ts", code: code.trim() });

export const snippets = {
  "sdk.quickstart": ts(`
import { Ensforge, ensActions } from "@ensforge/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
}).extend(ensActions());

const address = await ens.record.getAddress({ name: "ens.eth" });
`),
  "sdk.wagmi": ts(`
import { ensActions } from "@ensforge/sdk";
import { Ensforge } from "@ensforge/sdk/wagmi";

const ens = Ensforge.fromWagmi(wagmiConfig).extend(ensActions());

const address = await ens.record.getAddress({ name: "ens.eth" });
`),
} satisfies Record<string, Snippet>;

export type SnippetId = keyof typeof snippets;

export function isSnippetId(id: string): id is SnippetId {
  return id in snippets;
}
