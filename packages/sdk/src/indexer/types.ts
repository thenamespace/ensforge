import type { Deployments } from "@ensforge/contracts";
import type { Address, Hex } from "viem";

import type { EventAction, EventType } from "../actions/event/types.js";

/**
 * A naming system an indexer serves: ENS, or Basenames (`*.base.eth`, on Base). Its L2 namespace
 * IDs are `Deployments.NamespaceId`s, as `name.get` reports them in `namespace.id`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Namespace = "ens" | Extract<Deployments.NamespaceId, "basenames">;

/**
 * Which ENS protocol holds a name: `ensV0` is the pre-2020 registry, `ensV1` the current ENSv1
 * registry, `ensV2` an ENSv2 registry.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Authority = "ensV0" | "ensV1" | "ensV2";

/**
 * How much of an answer the indexer could give. `partial` and `unsupported` come with a reason;
 * a partial answer is never presented as complete.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Completeness = "full" | "partial" | "unsupported";

/**
 * A name's registration lifecycle.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type NameStatus = "active" | "expired" | "released" | "unregistered";

/**
 * Outcome of one answer inside a result (a record, a primary name, a lookup input).
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type AnswerStatus =
  | "ok"
  | "notFound"
  | "invalidName"
  | "mismatch"
  | "unsupported"
  | "stale"
  | "failed";

/**
 * How an address relates to a name.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Relation = "owner" | "manager" | "roleHolder" | "resolvesTo" | "formerOwner";

/**
 * A contract on a chain.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type ContractRef = { readonly chainId: number; readonly address: Address };

/**
 * The chain state an answer was read at.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Snapshot = {
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  /** Unix seconds. */
  readonly timestamp: bigint;
};

/**
 * What every indexer answer carries besides its data.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Meta = {
  /** Snapshot of the answer's main chain, or `null` when the indexer reports none. */
  readonly asOf: Snapshot | null;
  /** Every chain the answer read, keyed by chain ID. */
  readonly snapshots: Readonly<Record<number, Snapshot>>;
  /**
   * Pass back as `at: { token }` to read the same snapshot again (snapshot routes only).
   * `null` when the indexer does not support snapshots.
   */
  readonly asOfToken: string | null;
  readonly completeness: Completeness;
  /** Why the answer is partial or unsupported. */
  readonly unsupportedReason: string | null;
  /** Fields the indexer could not fill. */
  readonly unsupportedFields: readonly string[];
  /** Whether the indexer answered from its index or by an on-chain read. */
  readonly origin: "indexed" | "verified" | null;
  /** Id of the adapter that answered, e.g. `bigname`. */
  readonly indexer: string;
};

/**
 * One answer with its {@link Meta}.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Result<data> = data & Meta;

/**
 * One page of a list, with its {@link Meta}.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Page<item> = Meta & {
  readonly items: readonly item[];
  /** Pass as `cursor` for the next page; `null` on the last page. */
  readonly cursor: string | null;
  readonly hasMore: boolean;
  /** Total across pages, when requested with `includeTotal` and the indexer can count. */
  readonly totalCount: number | null;
};

/**
 * ENSv1 facts about a name: its ENSv1 resolver and NameWrapper state.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type EnsV1Facts = {
  readonly resolver: ContractRef | null;
  readonly expiresAt: bigint | null;
  readonly wrapperState:
    | "wrapped"
    | "emancipated"
    | "locked"
    | "lapsed"
    | "unwrapped"
    | "unknown"
    | null;
  readonly wrapperExpiresAt: bigint | null;
  /** NameWrapper fuses as a bitmap; decode with `Fuse`. */
  readonly wrapperFuses: number | null;
};

/**
 * A name as lists return it.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedName = {
  /** Normalized name; unknown labels appear as `[labelhash]`. */
  readonly name: string;
  readonly displayName: string;
  readonly namespace: string;
  readonly node: Hex;
  readonly status: NameStatus | null;
  readonly authority: Authority | null;
  /** Token holder (ENSv2) or registrant; `null` when unowned or not reported. */
  readonly owner: Address | null;
  /** ENSv1 registry owner (controller) when it differs in meaning from the holder. */
  readonly manager: Address | null;
  /** Unix seconds of the current registration. Lineage rules differ between indexers. */
  readonly registeredAt: bigint | null;
  /** Unix seconds the name first appeared. */
  readonly createdAt: bigint | null;
  /** Unix seconds; `2^64 - 1` for names that never expire. */
  readonly expiresAt: bigint | null;
  readonly graceEndsAt: bigint | null;
  /** Why `expiresAt` is `null`. */
  readonly expiryReason: "noExpiry" | "notSet" | "released" | null;
  readonly ensV1: EnsV1Facts | null;
};

/**
 * A name's records as `getName` and `lookup` return them: values the indexer has seen.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedProfile = {
  readonly texts: Readonly<Record<string, string>>;
  /** Addresses by decimal coin type, encoded as the chain writes them. */
  readonly addresses: Readonly<Record<string, string>>;
  readonly contentHash: Hex | null;
  /** Name record (ENSIP-3) of reverse names. */
  readonly name: string | null;
  /** Every text key ever set, including cleared ones. */
  readonly textKeys: readonly string[];
  /** Every coin type ever set, including cleared ones. */
  readonly coinTypes: readonly string[];
};

/**
 * One name in full.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedNameDetail = IndexedName & {
  readonly chainId: number | null;
  /** Indexer handle for the current registration; opaque, differs between indexers. */
  readonly registrationId: string | null;
  readonly tokenId: bigint | null;
  readonly resolver: ContractRef | null;
  /** ENSv2 registry for the name's children. */
  readonly subregistry: ContractRef | null;
  /** The ETH address the name resolves to. */
  readonly primaryAddress: Address | null;
  readonly migratedAt: bigint | null;
  readonly records: IndexedProfile | null;
  readonly recordCount: number | null;
  readonly subnameCount: number | null;
};

/**
 * A name an address is related to.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type AddressName = IndexedName & {
  readonly relations: readonly Relation[];
  /** Whether it is the address's primary name. */
  readonly isPrimary: boolean;
  readonly migratedAt: bigint | null;
  readonly recordCount: number | null;
  readonly subnameCount: number | null;
};

/**
 * A direct child of a name.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Subname = IndexedName & {
  readonly labelhash: Hex | null;
  readonly subnameCount: number | null;
  readonly subregistry: ContractRef | null;
};

/**
 * A name from `getNamesByExpiry`, with the window it matched.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type ExpiringName = IndexedName & {
  /** Index into `windows` (or `graceWindows`) that matched. */
  readonly windowIndex: number | null;
};

/**
 * One event from an indexer's history, in the same vocabulary as `event.*`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedEvent = {
  readonly id: string;
  readonly type: EventType;
  /** What happened; present when the event data was requested (`includeData`). */
  readonly action: EventAction | null;
  /** Indexer event kind, e.g. `RegistrationGranted`. */
  readonly kind: string | null;
  /** The name the event is about; `null` when the indexer does not say. */
  readonly name: string | null;
  readonly namespace: string;
  /** Whether the event is about the name or one of its children. */
  readonly subject: "name" | "child" | null;
  readonly registrationId: string | null;
  readonly contract: Address | null;
  readonly blockNumber: bigint | null;
  readonly timestamp: bigint | null;
  readonly transactionHash: Hex | null;
  readonly logIndex: number | null;
  /** Event details with camelCase keys, when requested with `includeData`. */
  readonly data: Readonly<Record<string, unknown>> | null;
};

/**
 * One record answer from `getRecords`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type RecordAnswer = {
  readonly status: AnswerStatus;
  readonly value: string | null;
  readonly reason: string | null;
};

/**
 * A name's records from `getRecords`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedRecords = {
  readonly namespace: string;
  readonly resolver: ContractRef | null;
  readonly texts: Readonly<Record<string, string>>;
  /** Addresses by decimal coin type. */
  readonly addresses: Readonly<Record<string, string>>;
  readonly contentHash: Hex | null;
  /** Every answer by record key (`text:avatar`, `addr:60`, `contenthash`), including failures. */
  readonly answers: Readonly<Record<string, RecordAnswer>>;
  /**
   * Every record key the resolver has seen for the name. `keys` are set; `unsetKeys` were
   * cleared; `unsupportedKeys` cannot be read through the indexer.
   */
  readonly inventory: {
    readonly keys: readonly string[];
    readonly unsetKeys: readonly string[];
    readonly unsupportedKeys: readonly string[];
  } | null;
};

/**
 * One primary name answer.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type PrimaryNameAnswer = {
  readonly source: "indexed" | "verified";
  readonly status: AnswerStatus;
  readonly name: string | null;
  readonly reason: string | null;
};

/**
 * An address's primary name from `getPrimaryName`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedPrimaryName = {
  readonly address: Address;
  readonly coinType: number;
  readonly namespace: string;
  /** The primary name: verified when the indexer verified it, otherwise indexed. */
  readonly name: string | null;
  /** Which answer `name` came from. */
  readonly source: "indexed" | "verified" | null;
  readonly answers: readonly PrimaryNameAnswer[];
};

/**
 * One input's answer from `lookup`.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type LookupResult = {
  readonly input: string;
  readonly kind: "name" | "address";
  readonly status: AnswerStatus;
  /** A name input, or an address's primary name. */
  readonly name: (IndexedNameDetail & { readonly isPrimary: boolean | null }) | null;
  /** An address input's related names. */
  readonly names: readonly (IndexedNameDetail & { readonly isPrimary: boolean | null })[];
  readonly reason: string | null;
};

/**
 * A permission one address holds over a name, registry or resolver.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type PermissionRow = {
  readonly address: Address;
  readonly name: string | null;
  readonly registrationId: string;
  /** Powers in the indexer's vocabulary, e.g. `set_resolver`, `admin_renew`. */
  readonly powers: readonly string[];
  /** Where the grant applies: `registry`, `registration`, `resolver`, … */
  readonly scope: string;
  readonly relation: "operator" | "holder" | null;
  /** NameWrapper state the permission depends on. */
  readonly wrapperState: "wrapped" | "emancipated" | "locked" | null;
  readonly lineage: Readonly<Record<string, unknown>> | null;
};

/**
 * An ENSv2 registry.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedRegistry = {
  readonly chainId: number;
  readonly address: Address;
  /** The name whose children it holds, when known. */
  readonly name: string | null;
  readonly parent: ContractRef | null;
  readonly createdAt: bigint | null;
  readonly createdBlockNumber: bigint | null;
  readonly createdTransactionHash: Hex | null;
  readonly counts: {
    readonly labels: number | null;
    readonly roles: number | null;
    readonly events: number | null;
  } | null;
  /** Names whose subregistry pointer is this registry. */
  readonly referencedBy: readonly string[];
};

/**
 * A label in an ENSv2 registry.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type RegistryLabel = Subname & {
  readonly roleHolderCount: number | null;
};

/**
 * A resolver and the names bound to it.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexedResolver = {
  readonly chainId: number;
  readonly address: Address;
  /** Names using this resolver, one page of them. */
  readonly names: readonly string[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
  /** ENSv1 registry this resolver mirrors, for ENSv1 compatibility resolvers. */
  readonly mirrors: ContractRef | null;
};

/**
 * A name linked to a record set on an ENSv2 resolver.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type ResolverLink = {
  readonly name: string;
  readonly node: Hex;
  readonly recordId: string;
  /** Whether it is the resolver's default record set. */
  readonly isDefault: boolean;
  readonly blockNumber: bigint | null;
  readonly transactionHash: Hex | null;
};

/**
 * A role grant on an ENSv2 resolver.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type ResolverRole = {
  readonly address: Address;
  readonly name: string | null;
  readonly registrationId: string;
  readonly powers: readonly string[];
  readonly blockNumber: bigint | null;
};

/**
 * A resolver on which an address holds roles.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type RoleHolderResolver = ContractRef & {
  readonly grantCount: number;
  readonly powers: readonly string[];
};

/**
 * What an indexer serves for one namespace.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type NamespaceInfo = {
  readonly namespace: string;
  /** Feature (e.g. `subnames`, `verified_records`) → completeness. */
  readonly capabilities: Readonly<Record<string, Completeness>>;
  readonly networks: readonly {
    readonly network: string;
    readonly chainId: number | null;
    /** ENS protocol resolving on that network, and since which block. */
    readonly protocol: "ensV1" | "ensV2" | null;
    readonly sinceBlock: bigint | null;
  }[];
};

/**
 * Indexing progress of one chain.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type ChainStatus = {
  readonly status: "ready" | "degraded" | "stale";
  readonly indexed: bigint | null;
  readonly latest: bigint | null;
  readonly safe: bigint | null;
  readonly finalized: bigint | null;
  readonly lagBlocks: number | null;
  readonly lagSeconds: number | null;
};

/**
 * An indexer's health.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type IndexerStatus = {
  readonly status: "ready" | "degraded" | "stale";
  readonly chains: Readonly<Record<number, ChainStatus>>;
  readonly indexer: string;
};
