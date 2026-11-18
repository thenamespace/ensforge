import { Array as Arr, Record as Rec, Schema, String as Str } from "effect";

import { getAddress, labelhash, namehash } from "viem";

import type { FakeRequest, Fixtures } from "../routes.js";
import type * as Wire from "./types.js";

// Recorded-style answers of bigname on mainnet, hand-built from the OpenAPI snapshot. Addresses
// are lowercase on the wire, as bigname sends them; the SDK checksums them.

export const addresses = {
  nick: getAddress("0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5"),
  manager: getAddress("0x283af0b28c62c092c9727f1ee09c02ca627eb7f5"),
  publicResolver: getAddress("0x231b0ee14048e9dccd1d247744d114a4eb5e8e63"),
  registry: getAddress("0x0635513f179d50a207757e05759cbd106d7dfce8"),
  parentRegistry: getAddress("0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e"),
  resolverV2: getAddress("0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41"),
  wrapper: getAddress("0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401"),
} as const;

const wire = (address: string) => Str.toLowerCase(address);

export const asOf: Wire.AsOf = {
  block_number: 21_000_000,
  block_hash: `0x${Str.repeat(32)("ab")}`,
  timestamp: "1730000000",
};

export const meta: Wire.Meta = {
  as_of: { "1": asOf },
  as_of_completeness: { "1": "full" },
  as_of_token: "snap_21000000",
  completeness: "full",
  source: "indexed",
  unsupported_fields: [],
};

const resolverRef: Wire.ContractRef = { chain_id: 1, address: wire(addresses.publicResolver) };

const nameRow = (name: string, fields: Partial<Wire.SearchName> = {}): Wire.SearchName => ({
  name,
  display_name: name,
  namespace: "ens",
  namehash: namehash(name),
  status: "active",
  authority: "ens_v1",
  owner: wire(addresses.nick),
  manager: wire(addresses.nick),
  registered_at: "1504207252",
  created_at: "1504207252",
  expires_at: "2031690868",
  grace_ends_at: "2039466868",
  ...fields,
});

export const nick: Wire.NameRecord = {
  ...nameRow("nick.eth"),
  status: "active",
  read_status: "ok",
  canonical_name: "nick.eth",
  chain_id: 1,
  network: "mainnet",
  registration_id: "reg_1_nick",
  token_id: BigInt(labelhash("nick")).toString(),
  resolver: resolverRef,
  primary_address: wire(addresses.nick),
  ens_v1: {
    resolver: resolverRef,
    expires_at: "2031690868",
    wrapper_state: "unwrapped",
    wrapper_expires_at: null,
    wrapper_fuses: { fuses: 0, cannot_unwrap: false, is_dot_eth: true },
  },
  records: {
    texts: {
      avatar: "https://metadata.ens.domains/mainnet/avatar/nick.eth",
      "com.twitter": "nicksdjohnson",
      description: null,
    },
    addresses: { "60": wire(addresses.nick), "0": null },
    contenthash: "0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe",
    name: null,
    seen_texts: ["avatar", "com.twitter", "description"],
    seen_addresses: ["60", "0"],
    abis: {},
    seen_singletons: ["contenthash"],
  },
  record_count: 3,
  subname_count: 3,
};

const subnameRow = (label: string, fields: Partial<Wire.Subname> = {}): Wire.Subname => ({
  ...nameRow(`${label}.nick.eth`, {
    expires_at: null,
    grace_ends_at: null,
    expires_at_reason: "no_expiry",
    registered_at: "1600000000",
  }),
  labelhash: labelhash(label),
  subname_count: 0,
  ...fields,
});

const labels = ["alpha", "beta", "gamma"];

export const subnames: readonly Wire.Subname[] = Arr.map(labels, (label) => subnameRow(label));

export const nickEvents: readonly Wire.HistoryEvent[] = [
  {
    id: "evt_2",
    type: "record",
    name: "nick.eth",
    namespace: "ens",
    subject: "name",
    kind: "TextChanged",
    registration_id: "reg_1_nick",
    contract_address: wire(addresses.publicResolver),
    block_number: 20_000_000,
    timestamp: "1717000000",
    transaction_hash: `0x${Str.repeat(32)("12")}`,
    log_index: 7,
    data: { action: "record_changed", key: "text:avatar", record_id: "r1", coin_type: 60 },
  },
  {
    id: "evt_1",
    type: "registration",
    name: "nick.eth",
    namespace: "ens",
    subject: "name",
    kind: "NameRegistered",
    registration_id: "reg_1_nick",
    contract_address: null,
    block_number: 4_200_000,
    timestamp: "1504207252",
    transaction_hash: `0x${Str.repeat(32)("34")}`,
    log_index: 0,
    data: { action: "registration_granted", expires_at: "2031690868", base_cost: "0" },
  },
];

const recordAnswers: Readonly<Record<string, Wire.RecordAnswer>> = {
  "text:avatar": {
    status: "ok",
    value: "https://metadata.ens.domains/mainnet/avatar/nick.eth",
  },
  "text:com.twitter": { status: "ok", value: "nicksdjohnson" },
  "addr:60": { status: "ok", value: wire(addresses.nick) },
  contenthash: {
    status: "ok",
    value: "0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe",
  },
  "text:url": { status: "not_found", failure_reason: "unset" },
};

export const nickRecords: Wire.NameRecords = {
  namespace: "ens",
  resolver: resolverRef,
  records: recordAnswers,
  inventory: {
    known_keys: ["text:avatar", "text:com.twitter", "addr:60", "contenthash"],
    unset_keys: ["text:description"],
    unsupported_keys: ["abi:1"],
    abi_content_types: null,
  },
};

export const permissionRows: readonly Wire.PermissionRow[] = [
  {
    address: wire(addresses.nick),
    name: "nick.eth",
    registration_id: "reg_1_nick",
    powers: ["set_resolver", "admin_renew"],
    grant_scope: { kind: "registration", detail: {} },
    grant_relation: "holder",
    wrapper_state: "unwrapped",
    authority_context: "current_for_name",
    lineage: { granted_by: wire(addresses.manager), grant_event: { block_number: 4_200_000 } },
  },
];

export const registryOverview: Wire.RegistryOverview = {
  chain_id: 1,
  address: wire(addresses.registry),
  name: { name: "nick.eth", display_name: "nick.eth" },
  parent_registry: { chain_id: 1, address: wire(addresses.parentRegistry) },
  created_block_number: 21_500_000,
  created_at: "1735000000",
  created_transaction_hash: `0x${Str.repeat(32)("56")}`,
  created_basis: "event",
  counts: { labels: 3, roles: 4, events: 12 },
  referenced_by: {
    data: [{ name: "nick.eth" }],
    page: { cursor: null, next_cursor: null, page_size: 50, total_count: null, has_more: false },
  },
};

export const roleHolderResolvers: readonly Wire.RoleHolderResolver[] = [
  { chain_id: 1, address: wire(addresses.resolverV2), grant_count: 2, powers: ["set_addr"] },
];

export const ensNamespace: Wire.NamespaceData = {
  namespace: "ens",
  capabilities: {
    subnames: { completeness: "full" },
    verified_records: { completeness: "full" },
    history: { completeness: "partial" },
  },
  networks: [
    {
      network: "mainnet",
      chain_id: 1,
      resolution: { protocol: "ens_v1", since_block: 9_380_380 },
    },
  ],
};

export const chainStatus: Wire.ChainStatus = {
  status: "ready",
  latest_block: 21_000_010,
  indexed_block: 21_000_000,
  safe_block: 20_999_970,
  finalized_block: 20_999_940,
  lag_blocks: 10,
  lag_seconds: 120,
  network_head_status: "fresh",
};

export const status: Wire.StatusData = {
  status: "ready",
  pending_invalidation_count: 0,
  pending_invalidation_count_capped: false,
  dead_letter_count: 0,
  chains: { "1": chainStatus },
};

const LookupBody = Schema.Struct({
  inputs: Schema.Array(
    Schema.Struct({
      name: Schema.optionalKey(Schema.String),
      address: Schema.optionalKey(Schema.String),
    }),
  ),
});

const sameAddress = (left: string | undefined, right: string) =>
  left !== undefined && Str.toLowerCase(left) === Str.toLowerCase(right);

/** One page of `rows`, honouring `page_size` and `cursor` (`c<offset>`) like bigname. */
export const paged = (request: FakeRequest, rows: readonly unknown[]): Wire.Envelope => {
  const size = Number(request.query.get("page_size") ?? 50);
  const cursor = request.query.get("cursor");
  const offset = cursor === null ? 0 : Number(Str.slice(1)(cursor));
  const next = offset + size;
  const hasMore = next < rows.length;
  const counted = Str.split(request.query.get("include") ?? "", ",").includes("total_count");

  return {
    data: rows.slice(offset, next),
    meta,
    page: {
      cursor,
      next_cursor: hasMore ? `c${next}` : null,
      page_size: size,
      total_count: counted ? rows.length : null,
      has_more: hasMore,
    },
  };
};

const resolverRecords = (request: FakeRequest): Wire.Envelope | undefined => {
  const keysParam = request.query.get("keys");
  if (keysParam === null) return { data: nickRecords, meta };

  const keys = Str.split(keysParam, ",");

  const records = Rec.fromEntries(
    Arr.map(keys, (key) => [key, recordAnswers[key] ?? { status: "not_found" }]),
  );
  return { data: { ...nickRecords, records }, meta };
};

const nameRows = [nameRow("nick.eth"), ...Arr.map(subnames, (row) => nameRow(row.name))];

export const bigname: Fixtures = {
  "/status": () => ({ data: status }),
  "/namespaces/{namespace}": ({ params }) =>
    params.namespace === "ens" ? { data: ensNamespace } : undefined,
  "/names/{name}": ({ params }) => (params.name === "nick.eth" ? { data: nick, meta } : undefined),
  "/names/{name}/subnames": (request) =>
    request.params.name === "nick.eth" ? paged(request, subnames) : undefined,
  "/names/{name}/history": (request) =>
    request.params.name === "nick.eth" ? paged(request, nickEvents) : undefined,
  "/names/{name}/records": (request) =>
    request.params.name === "nick.eth" ? resolverRecords(request) : undefined,
  "/addresses/{address}/names": (request) =>
    paged(
      request,
      sameAddress(request.params.address, addresses.nick)
        ? [
            {
              ...nameRow("nick.eth"),
              relations: ["owner", "resolves_to", "role_holder"],
              is_primary: true,
              record_count: 3,
              subname_count: 3,
            },
          ]
        : [],
    ),
  "/addresses/{address}/history": (request) =>
    paged(request, sameAddress(request.params.address, addresses.nick) ? nickEvents : []),
  "/addresses/{address}/primary-name": ({ params }) => ({
    data: {
      address: wire(params.address ?? ""),
      coin_type: 60,
      namespace: "ens",
      answers: sameAddress(params.address, addresses.nick)
        ? [
            { source: "indexed", status: "ok", name: "nick.eth" },
            { source: "verified", status: "ok", name: "nick.eth" },
          ]
        : [{ source: "indexed", status: "not_found" }],
      verification: { status: "ok", name: "nick.eth" },
    },
    meta,
  }),
  // bigname leaves `name` out of rows filtered by name.
  "/events": (request) => {
    const name = request.query.get("name");
    const rows =
      name === null
        ? nickEvents
        : Arr.map(
            Arr.filter(nickEvents, (event) => event.name === name),
            ({ name: _name, ...event }) => event,
          );
    return paged(request, rows);
  },
  "/search": (request) => {
    const query = request.query.get("q") ?? "";
    const contains = request.query.get("match") === "contains";
    return paged(
      request,
      Arr.filter(nameRows, (row) =>
        contains ? Str.includes(query)(row.name) : Str.startsWith(query)(row.name),
      ),
    );
  },
  "/lookup": (request) => {
    // A synchronous route answer, outside any Effect runtime.
    // oxlint-disable-next-line effecttsgo/schema-sync
    const { inputs } = Schema.decodeUnknownSync(LookupBody)(request.body);
    const results = Arr.map(inputs, (input): Wire.LookupResult => {
      if (input.address !== undefined) {
        return sameAddress(input.address, addresses.nick)
          ? {
              input,
              kind: "address",
              status: "ok",
              record: { ...nick, is_primary: true },
              records: [{ ...nick, is_primary: true }],
            }
          : { input, kind: "address", status: "not_found", records: [] };
      }
      return input.name === "nick.eth"
        ? { input, kind: "name", status: "ok", record: nick }
        : { input, kind: "name", status: "not_found", failure_reason: "unregistered" };
    });
    return { data: results, meta };
  },
  "/names": (request) =>
    paged(
      request,
      Arr.map(["nick.eth", "alpha.nick.eth"], (name, index) =>
        nameRow(name, { expires_window_index: index }),
      ),
    ),
  "/permissions": (request) => paged(request, permissionRows),
  "/registries/{chain_id}/{address}": ({ params }) =>
    sameAddress(params.address, addresses.registry) ? { data: registryOverview, meta } : undefined,
  "/registries/{chain_id}/{address}/labels": (request) =>
    sameAddress(request.params.address, addresses.registry)
      ? paged(
          request,
          Arr.map(labels, (label) =>
            subnameRow(label, { authority: "ens_v2", role_holder_count: 1 }),
          ),
        )
      : undefined,
  "/resolvers": (request) => paged(request, roleHolderResolvers),
  "/resolvers/{chain_id}/{address}": ({ params }) =>
    sameAddress(params.address, addresses.resolverV2)
      ? {
          data: {
            chain_id: Number(params.chain_id),
            address: wire(addresses.resolverV2),
            bound_names: {
              data: [nick],
              page: {
                cursor: null,
                next_cursor: "c1",
                page_size: 1,
                total_count: null,
                has_more: true,
              },
            },
            mirror: { kind: "ensv1_registry", registry: resolverRef },
          },
          meta,
        }
      : undefined,
  "/resolvers/{chain_id}/{address}/links": (request) =>
    paged(request, [
      {
        name: "nick.eth",
        namehash: namehash("nick.eth"),
        record_id: "1",
        default: true,
        link_event: { block_number: 21_600_000, transaction_hash: `0x${Str.repeat(32)("78")}` },
      },
      { namehash: namehash("alpha.nick.eth"), record_id: "2", default: false, link_event: {} },
    ]),
  "/resolvers/{chain_id}/{address}/roles": (request) =>
    paged(request, [
      {
        address: wire(addresses.manager),
        name: "nick.eth",
        registration_id: "reg_1_nick",
        powers: ["set_addr", "set_text"],
        grant_event: { block_number: 21_600_001 },
      },
    ]),
  "/resolvers/{chain_id}/{address}/records": resolverRecords,
};
