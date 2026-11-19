/**
 * Every code sample on the marketing pages, highlighted on the server by `highlightSnippets`
 * (and tokenized for Magic Move by `keyedSnippets`). Samples must use the packages' real APIs.
 * The `home.*` samples are the playground's calls; their literal `nick.eth` (or address) is swapped
 * for the reader's input.
 */
interface Snippet {
  readonly lang: "ts" | "tsx" | "bash";
  readonly code: string;
}

const ts = (code: string): Snippet => ({ lang: "ts", code: code.trim() });

export const snippets = {
  "sdk.quickstart": ts(`
import { Ensforge, ensActions } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet }).extend(ensActions());

const address = await ens.record.getAddress({ name: "ens.eth" });
`),
  "sdk.wagmi": ts(`
import { ensActions } from "@ensforge/sdk";
import { Ensforge } from "@ensforge/sdk/wagmi";

const ens = Ensforge.fromWagmi(wagmiConfig).extend(ensActions());

const address = await ens.record.getAddress({ name: "ens.eth" });
`),
  "home.profile": ts(`
import { Ensforge, ensActions } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet }).extend(ensActions());

const [state, records, avatar] = await Promise.all([
  ens.name.get({ name: "nick.eth" }),
  ens.record.get({
    name: "nick.eth",
    texts: ["description", "url", "com.github", "com.twitter", "org.telegram", "com.discord", "email"],
    addresses: ["eth"],
  }),
  ens.record.getAvatar({ name: "nick.eth" }),
]);
`),
  "home.address.eth": ts(`
import { ens } from "./ens";

const address = await ens.record.getAddress({ name: "nick.eth" });
// "0x…" | null
`),
  "home.address.btc": ts(`
import { ens } from "./ens";

const address = await ens.record.getAddress({ name: "nick.eth", coin: "btc" });
// "bc1…" | null
`),
  "home.address.base": ts(`
import { ens } from "./ens";

const address = await ens.record.getAddress({ name: "nick.eth", coin: { chainId: 8453 } });
// "0x…" | null
`),
  "home.primaryName": ts(`
import { ens } from "./ens";

const name = await ens.primaryName.get({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
});
// "vitalik.eth" | null
`),
  "home.avatar": ts(`
import { ens } from "./ens";

const src = await ens.record.getAvatar({ name: "nick.eth" });
// An https URL, even for ipfs://, ar:// and NFT avatars
`),
  "home.batch": ts(`
import { Actions } from "@ensforge/sdk";
import { ens } from "./ens";

const { results } = await ens.batch({
  requests: {
    address: Actions.record.getAddress.request({ name: "nick.eth" }),
    avatar: Actions.record.getAvatar.request({ name: "nick.eth" }),
    url: Actions.record.getText.request({ name: "nick.eth", key: "url" }),
    state: Actions.name.get.request({ name: "nick.eth" }),
  },
});
`),
} satisfies Record<string, Snippet>;

export type SnippetId = keyof typeof snippets;

export function isSnippetId(id: string): id is SnippetId {
  return id in snippets;
}
