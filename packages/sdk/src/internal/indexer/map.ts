import { getAddress, type Address, type Hex } from "viem";

import type { EventAction, EventType } from "../../actions/event/types.js";
import type * as T from "../../indexer/types.js";
import type * as Wire from "./wire.js";

type Of<schema extends { readonly Type: unknown }> = schema["Type"];

const big = (value: string | number | null | undefined): bigint | null =>
  value === null || value === undefined ? null : BigInt(value);

const address = (value: string | null | undefined): Address | null =>
  value === null || value === undefined ? null : getAddress(value);

const contract = (value: Of<typeof Wire.ContractRef> | null | undefined): T.ContractRef | null =>
  value === null || value === undefined
    ? null
    : { chainId: value.chain_id, address: getAddress(value.address) };

const camel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

/** snake_case keys to camelCase, recursively; values are kept. */
export const camelize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(camelize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [camel(key), camelize(entry)]),
  );
};

const authorities: Readonly<Record<string, T.Authority>> = {
  ens_v0: "ensV0",
  ens_v1: "ensV1",
  ens_v2: "ensV2",
};

const authority = (value: string | null | undefined): T.Authority | null =>
  (value === null || value === undefined ? undefined : authorities[value]) ?? null;

const oneOf = <const values extends string>(
  values: readonly values[],
  value: string | null | undefined,
): values | null =>
  (values as readonly (string | null | undefined)[]).includes(value) ? (value as values) : null;

const answerStatus = (value: string): T.AnswerStatus =>
  oneOf(
    ["ok", "notFound", "invalidName", "mismatch", "unsupported", "stale", "failed"],
    camel(value),
  ) ?? "failed";

const relation = (value: string): T.Relation => camel(value) as T.Relation;

/** The answer's metadata; `chainId` picks `asOf` among the chains it read. */
export const meta = (
  wire: Of<typeof Wire.Meta> | null | undefined,
  chainId: number,
  indexer: string,
): T.Meta => {
  const snapshots: Record<number, T.Snapshot> = {};
  for (const [chain, asOf] of Object.entries(wire?.as_of ?? {})) {
    snapshots[Number(chain)] = {
      chainId: Number(chain),
      blockNumber: BigInt(asOf.block_number),
      blockHash: asOf.block_hash as Hex,
      timestamp: BigInt(asOf.timestamp),
    };
  }

  return {
    asOf: snapshots[chainId] ?? Object.values(snapshots)[0] ?? null,
    snapshots,
    asOfToken: wire?.as_of_token ?? null,
    completeness: oneOf(["full", "partial", "unsupported"], wire?.completeness) ?? "full",
    unsupportedReason: wire?.unsupported_reason ?? null,
    unsupportedFields: wire?.unsupported_fields ?? [],
    origin: oneOf(["indexed", "verified"], wire?.source),
    indexer,
  };
};

/** A page of `items` with the page fields of the envelope. */
export const page = <item>(
  envelope: {
    readonly meta?: Of<typeof Wire.Meta> | null | undefined;
    readonly page?: Of<typeof Wire.Page> | null | undefined;
  },
  items: readonly item[],
  chainId: number,
  indexer: string,
): T.Page<item> => ({
  ...meta(envelope.meta, chainId, indexer),
  items,
  cursor: envelope.page?.next_cursor ?? null,
  hasMore: envelope.page?.has_more ?? false,
  totalCount: envelope.page?.total_count ?? null,
});

const ensV1 = (wire: Of<typeof Wire.EnsV1> | null | undefined): T.EnsV1Facts | null =>
  wire === null || wire === undefined
    ? null
    : {
        resolver: contract(wire.resolver),
        expiresAt: big(wire.expires_at),
        wrapperState: oneOf(
          ["wrapped", "emancipated", "locked", "lapsed", "unwrapped", "unknown"],
          wire.wrapper_state,
        ),
        wrapperExpiresAt: big(wire.wrapper_expires_at),
        wrapperFuses: wire.wrapper_fuses?.fuses ?? null,
      };

export const name = (wire: Of<typeof Wire.SearchName>): T.IndexedName => ({
  name: wire.name,
  displayName: wire.display_name ?? wire.name,
  namespace: wire.namespace ?? "ens",
  node: wire.namehash as Hex,
  status: oneOf(["active", "expired", "released", "unregistered"], wire.status),
  authority: authority(wire.authority),
  owner: address(wire.owner),
  manager: address(wire.manager),
  registeredAt: big(wire.registered_at),
  createdAt: big(wire.created_at),
  expiresAt: big(wire.expires_at),
  graceEndsAt: big(wire.grace_ends_at),
  expiryReason:
    wire.expires_at_reason === null || wire.expires_at_reason === undefined
      ? null
      : oneOf(["noExpiry", "notSet", "released"], camel(wire.expires_at_reason)),
  ensV1: ensV1(wire.ens_v1),
});

const present = (values: Readonly<Record<string, string | null>> | null | undefined) =>
  Object.fromEntries(
    Object.entries(values ?? {}).filter((entry): entry is [string, string] => entry[1] !== null),
  );

const profile = (
  wire: Of<typeof Wire.RecordGroups> | null | undefined,
): T.IndexedProfile | null => {
  if (wire === null || wire === undefined) return null;

  return {
    texts: present(wire.texts),
    addresses: present(wire.addresses),
    contentHash: (wire.contenthash ?? null) as Hex | null,
    name: wire.name ?? null,
    textKeys: wire.seen_texts ?? Object.keys(wire.texts ?? {}),
    coinTypes: wire.seen_addresses ?? Object.keys(wire.addresses ?? {}),
  };
};

export const detail = (wire: Of<typeof Wire.NameRecord>): T.IndexedNameDetail => ({
  ...name(wire),
  chainId: wire.chain_id ?? null,
  registrationId: wire.registration_id ?? null,
  tokenId: big(wire.token_id),
  resolver: contract(wire.resolver),
  subregistry: contract(wire.subregistry),
  primaryAddress: address(wire.primary_address),
  migratedAt: big(wire.migrated_at),
  records: profile(wire.records),
  recordCount: wire.record_count ?? null,
  subnameCount: wire.subname_count ?? null,
});

export const addressName = (wire: Of<typeof Wire.AddressName>): T.AddressName => ({
  ...name(wire),
  relations: (wire.relations ?? []).map(relation),
  isPrimary: wire.is_primary ?? false,
  migratedAt: big(wire.migrated_at),
  recordCount: wire.record_count ?? null,
  subnameCount: wire.subname_count ?? null,
});

export const subname = (wire: Of<typeof Wire.Subname>): T.Subname => ({
  ...name(wire),
  labelhash: (wire.labelhash ?? null) as Hex | null,
  subnameCount: wire.subname_count ?? null,
  subregistry: contract(wire.subregistry),
});

export const registryLabel = (wire: Of<typeof Wire.RegistryLabel>): T.RegistryLabel => ({
  ...subname(wire),
  roleHolderCount: wire.role_holder_count ?? null,
});

export const expiringName = (wire: Of<typeof Wire.SearchName>): T.ExpiringName => ({
  ...name(wire),
  windowIndex: wire.expires_window_index ?? wire.grace_ends_window_index ?? null,
});

/** One event; `name` fills in the name a query filtered by, which the indexer leaves out. */
export const event = (wire: Of<typeof Wire.HistoryEvent>, queried?: string): T.IndexedEvent => {
  const data = wire.data ?? null;
  return {
    id: wire.id,
    type: wire.type as EventType,
    action: typeof data?.action === "string" ? (data.action as EventAction) : null,
    kind: wire.kind ?? null,
    name: wire.name ?? queried ?? null,
    namespace: wire.namespace ?? "ens",
    subject: oneOf(["name", "child"], wire.subject),
    registrationId: wire.registration_id ?? null,
    contract: address(wire.contract_address),
    blockNumber: big(wire.block_number),
    timestamp: big(wire.timestamp),
    transactionHash: (wire.transaction_hash ?? null) as Hex | null,
    logIndex: wire.log_index ?? null,
    data: data === null ? null : (camelize(data) as Readonly<Record<string, unknown>>),
  };
};

export const records = (wire: Of<typeof Wire.NameRecords>): T.IndexedRecords => {
  const answers: Record<string, T.RecordAnswer> = {};
  const texts: Record<string, string> = {};
  const addresses: Record<string, string> = {};
  let contentHash: Hex | null = null;

  for (const [key, answer] of Object.entries(wire.records ?? {})) {
    const value = answer.value ?? null;
    answers[key] = {
      status: answerStatus(answer.status),
      value,
      reason: answer.failure_reason ?? answer.unsupported_reason ?? null,
    };
    if (answer.status !== "ok" || value === null) continue;
    if (key.startsWith("text:")) texts[key.slice(5)] = value;
    else if (key.startsWith("addr:")) addresses[key.slice(5)] = value;
    else if (key === "contenthash") contentHash = value as Hex;
  }

  const { inventory } = wire;
  return {
    namespace: wire.namespace ?? "ens",
    resolver: contract(wire.resolver),
    texts,
    addresses,
    contentHash,
    answers,
    inventory:
      inventory === null || inventory === undefined
        ? null
        : {
            keys: inventory.known_keys ?? [],
            unsetKeys: inventory.unset_keys ?? [],
            unsupportedKeys: inventory.unsupported_keys ?? [],
          },
  };
};

export const primaryName = (wire: Of<typeof Wire.PrimaryName>): T.IndexedPrimaryName => {
  const answers = (wire.answers ?? []).flatMap((answer): T.PrimaryNameAnswer[] => {
    const source = oneOf(["indexed", "verified"], answer.source);
    return source === null
      ? []
      : [
          {
            source,
            status: answerStatus(answer.status),
            name: answer.name ?? null,
            reason: answer.failure_reason ?? answer.unsupported_reason ?? null,
          },
        ];
  });
  // A verified answer wins; an indexed one is used when nothing was verified.
  const chosen =
    answers.find((answer) => answer.source === "verified" && answer.status === "ok") ??
    answers.find((answer) => answer.source === "indexed" && answer.status === "ok");

  return {
    address: getAddress(wire.address),
    coinType: wire.coin_type,
    namespace: wire.namespace ?? "ens",
    name: chosen?.name ?? null,
    source: chosen?.source ?? null,
    answers,
  };
};

const lookupRecord = (wire: Of<typeof Wire.LookupRecord>) => ({
  ...detail(wire),
  isPrimary: wire.is_primary ?? null,
});

export const lookupResult = (wire: Of<typeof Wire.LookupResult>): T.LookupResult => {
  const names = (wire.records ?? []).map(lookupRecord);
  // Name inputs answer one `record`; address inputs list their names, the primary one marked.
  const record =
    wire.record === null || wire.record === undefined
      ? (names.find((row) => row.isPrimary === true) ?? null)
      : lookupRecord(wire.record);
  return {
    input: wire.input.name ?? wire.input.address ?? "",
    kind: wire.kind === "address" ? "address" : "name",
    status: answerStatus(wire.status),
    name: record,
    names,
    reason: wire.failure_reason ?? wire.unsupported_reason ?? null,
  };
};

export const permission = (wire: Of<typeof Wire.PermissionRow>): T.PermissionRow => ({
  address: getAddress(wire.address),
  name: wire.name ?? null,
  registrationId: wire.registration_id,
  powers: wire.powers,
  scope: wire.grant_scope.kind,
  relation: oneOf(["operator", "holder"], wire.grant_relation),
  wrapperState: oneOf(["wrapped", "emancipated", "locked"], wire.wrapper_state),
  lineage:
    wire.lineage === null || wire.lineage === undefined
      ? null
      : (camelize(wire.lineage) as Readonly<Record<string, unknown>>),
});

export const registry = (wire: Of<typeof Wire.RegistryOverview>): T.IndexedRegistry => ({
  chainId: wire.chain_id,
  address: getAddress(wire.address),
  name: wire.name?.name ?? null,
  parent: contract(wire.parent_registry),
  createdAt: big(wire.created_at),
  createdBlockNumber: big(wire.created_block_number),
  createdTransactionHash: (wire.created_transaction_hash ?? null) as Hex | null,
  counts:
    wire.counts === null || wire.counts === undefined
      ? null
      : {
          labels: wire.counts.labels ?? null,
          roles: wire.counts.roles ?? null,
          events: wire.counts.events ?? null,
        },
  referencedBy: (wire.referenced_by?.data ?? []).map((entry) => entry.name),
});

export const resolver = (wire: Of<typeof Wire.ResolverOverview>): T.IndexedResolver => ({
  chainId: wire.chain_id,
  address: getAddress(wire.address),
  names: (wire.bound_names?.data ?? []).map((entry) => entry.name),
  cursor: wire.bound_names?.page?.next_cursor ?? null,
  hasMore: wire.bound_names?.page?.has_more ?? false,
  mirrors: contract(wire.mirror?.registry),
});

export const resolverLink = (wire: Of<typeof Wire.ResolverLink>): T.ResolverLink => ({
  name: wire.name ?? "",
  node: wire.namehash as Hex,
  recordId: wire.record_id,
  isDefault: wire.default,
  blockNumber: big(wire.link_event?.block_number),
  transactionHash: (wire.link_event?.transaction_hash ?? null) as Hex | null,
});

export const resolverRole = (wire: Of<typeof Wire.ResolverRole>): T.ResolverRole => ({
  address: getAddress(wire.address),
  name: wire.name ?? null,
  registrationId: wire.registration_id,
  powers: wire.powers,
  blockNumber: big(wire.grant_event?.block_number),
});

export const roleHolderResolver = (
  wire: Of<typeof Wire.RoleHolderResolver>,
): T.RoleHolderResolver => ({
  chainId: wire.chain_id,
  address: getAddress(wire.address),
  grantCount: wire.grant_count,
  powers: wire.powers,
});

export const namespace = (wire: Of<typeof Wire.Namespace>): T.NamespaceInfo => ({
  namespace: wire.namespace,
  capabilities: Object.fromEntries(
    Object.entries(wire.capabilities ?? {}).map(([feature, capability]) => [
      feature,
      oneOf(["full", "partial", "unsupported"], capability.completeness) ?? "unsupported",
    ]),
  ),
  networks: (wire.networks ?? []).map((network) => ({
    network: network.network,
    chainId: network.chain_id ?? null,
    protocol: authority(network.resolution?.protocol) as "ensV1" | "ensV2" | null,
    sinceBlock: big(network.resolution?.since_block),
  })),
});

const opsStatus = (value: string | null | undefined): T.ChainStatus["status"] =>
  oneOf(["ready", "degraded", "stale"], value) ?? "degraded";

export const status = (wire: Of<typeof Wire.StatusData>, indexer: string): T.IndexerStatus => ({
  status: opsStatus(wire.status),
  chains: Object.fromEntries(
    Object.entries(wire.chains).map(([chainId, chain]) => [
      Number(chainId),
      {
        status: opsStatus(chain.status),
        indexed: big(chain.indexed_block),
        latest: big(chain.latest_block),
        safe: big(chain.safe_block),
        finalized: big(chain.finalized_block),
        lagBlocks: chain.lag_blocks ?? null,
        lagSeconds: chain.lag_seconds ?? null,
      },
    ]),
  ),
  indexer,
});
