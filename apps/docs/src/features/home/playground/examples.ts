import type { SnippetId } from "@/content/snippets";

/**
 * The playground's tabs: each one real read of `@ensforge/sdk` against Ethereum mainnet. This
 * module only describes them; the SDK itself loads with `./client` when the playground is seen.
 */

export type ExampleId = "profile" | "address" | "primaryName" | "avatar" | "batch";

export type Chain = "eth" | "btc" | "base";

export interface Preset {
  readonly label: string;
  readonly value: string;
}

export interface Example {
  readonly id: ExampleId;
  readonly label: string;
  /** The actions the tab calls, as they read in code. */
  readonly api: string;
  readonly description: string;
  readonly input: "name" | "address";
  readonly presets: readonly Preset[];
  /** Chains the tab can read, when it has a chain selector. */
  readonly chains?: readonly Chain[];
  /** Snippet per chain (or one for every chain); its literal input is swapped for the reader's. */
  readonly snippets: Partial<Record<Chain, SnippetId>> & { readonly eth: SnippetId };
}

const names: readonly Preset[] = [
  { label: "nick.eth", value: "nick.eth" },
  { label: "vitalik.eth", value: "vitalik.eth" },
  { label: "ens.eth", value: "ens.eth" },
  { label: "jesse.base.eth", value: "jesse.base.eth" },
  { label: "envoy1084.eth", value: "envoy1084.eth" },
  { label: "cap.eth", value: "cap.eth" },
  { label: "artii.eth", value: "artii.eth" },
  { label: "maxi.eth", value: "maxi.eth" },
];

export const chainLabels: Record<Chain, string> = { eth: "Ethereum", btc: "Bitcoin", base: "Base" };

export const examples: readonly Example[] = [
  {
    id: "profile",
    label: "Profile",
    api: "name.get + record.get",
    description:
      "A name's state, its text records, address and avatar: everything a profile page shows.",
    input: "name",
    presets: names,
    snippets: { eth: "home.profile" },
  },
  {
    id: "address",
    label: "Address",
    api: "record.getAddress",
    description: "Where to send funds for a name, on Ethereum, Bitcoin or an L2 like Base.",
    input: "name",
    presets: names,
    chains: ["eth", "btc", "base"],
    snippets: { eth: "home.address.eth", btc: "home.address.btc", base: "home.address.base" },
  },
  {
    id: "primaryName",
    label: "Primary name",
    api: "primaryName.get",
    description: "The name an address shows as, verified to resolve back to that address.",
    input: "address",
    presets: [
      { label: "vitalik.eth", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
      { label: "nick.eth", value: "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5" },
      { label: "jesse.base.eth", value: "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9" },
      { label: "envoy1084.eth", value: "0xc0d86456F6f2930b892f3DAD007CDBE32c081FE6" },
      { label: "cap.eth", value: "0x035eBd096AFa6b98372494C7f08f3402324117D3" },
      { label: "artii.eth", value: "0x1D84ad46F1ec91b4Bb3208F645aD2fA7aBEc19f8" },
      { label: "maxi.eth", value: "0xc9E6eB83da7A627961b89acd4b6405941c36e2c8" },
    ],
    snippets: { eth: "home.primaryName" },
  },
  {
    id: "avatar",
    label: "Avatar",
    api: "record.getAvatar",
    description: "The avatar as an image URL: IPFS, Arweave and NFT avatars resolved for you.",
    input: "name",
    presets: names,
    snippets: { eth: "home.avatar" },
  },
  {
    id: "batch",
    label: "Look up many",
    api: "batch",
    description:
      "Four reads of one name in a single batch, coalesced into as few requests as possible.",
    input: "name",
    presets: names,
    snippets: { eth: "home.batch" },
  },
];

/** The input every snippet is written with, replaced by what the reader typed. */
export const snippetInput = {
  name: "nick.eth",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
} as const;

export const snippetIds = [
  ...new Set(examples.flatMap((example) => Object.values(example.snippets))),
] satisfies readonly SnippetId[];

export interface SocialRecord {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}

/** What the result card draws, derived from the raw response. */
export type ResultView =
  | {
      readonly kind: "profile";
      readonly name: string;
      readonly avatar: string | null;
      readonly description: string | null;
      readonly address: string | null;
      readonly socials: readonly SocialRecord[];
      readonly facts: readonly { readonly label: string; readonly value: string }[];
    }
  | {
      readonly kind: "address";
      readonly name: string;
      readonly chain: Chain;
      readonly address: string | null;
    }
  | {
      readonly kind: "primaryName";
      readonly address: string;
      readonly chain: Chain;
      readonly name: string | null;
    }
  | { readonly kind: "avatar"; readonly name: string; readonly url: string | null }
  | {
      readonly kind: "batch";
      readonly name: string;
      readonly rows: readonly {
        readonly key: string;
        readonly ok: boolean;
        readonly value: string;
      }[];
    };

export type RunOutcome =
  | {
      readonly ok: true;
      /** The response as JSON-safe data (bigints as strings), for the output panel. */
      readonly json: unknown;
      readonly view: ResultView;
      readonly ms: number;
      /** RPC requests the read sent over HTTP: 0 when the result came from the cache. */
      readonly requests: number;
      readonly cached: boolean;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly title: string;
      readonly message: string;
      readonly docs: string | undefined;
      readonly json: unknown;
      readonly ms: number;
    };
