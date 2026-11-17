import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  isAddressEqual,
  numberToHex,
  pad,
  toEventSelector,
  type Address,
  type Hex,
  type Log,
} from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { namehash } from "../../utils/Name.js";
import { nonZeroAddress } from "../address.js";
import type { LoadedName } from "../name/load.js";
import * as Rpc from "../rpc/index.js";
import { scanLogs, type BlockRange, type LogQuery } from "./scan.js";

/** Topic 0 of every variant of the named events. */
const topics = (...names: readonly string[]): Hex[] =>
  Abis.shared.events
    .filter((item) => names.includes(item.name))
    .map((item) => toEventSelector(item as Parameters<typeof toEventSelector>[0]));

const nodeKeyedResolverEvents = topics(
  "AddrChanged",
  "AddressChanged",
  "TextChanged",
  "ContenthashChanged",
  "ContentChanged",
  "ABIChanged",
  "InterfaceChanged",
  "NameChanged",
  "PubkeyChanged",
  "DataChanged",
  "VersionChanged",
);
const recordKeyedResolverEvents = topics(
  "AddressUpdated",
  "TextUpdated",
  "ContenthashUpdated",
  "ABIUpdated",
  "InterfaceUpdated",
  "NameUpdated",
  "DataUpdated",
  "Cleared",
);

const word = (value: bigint): Hex => numberToHex(value, { size: 32 });

/** ENSv2 token ids drop their low 32 bits (the version) to compare across regenerations. */
const canonical = (id: bigint): bigint => id ^ (id & 0xffffffffn);

/** The addresses that are set: neither missing nor the zero address. */
const known = (addresses: readonly (Address | null | undefined)[]): Address[] =>
  addresses.flatMap((address) => nonZeroAddress(address) ?? []);

/** ENSv1 queries: registry, `.eth` registrar and controllers, NameWrapper, resolver, DNS. */
const v1Queries = (client: Client, loaded: LoadedName): LogQuery[] => {
  const v1 = client.deployment.v1?.contracts;
  if (v1 === undefined) return [];
  const { parts } = loaded.data;
  const parent = namehash(parts.name.slice(parts.name.indexOf(".") + 1));
  const resolvers = known([loaded.data.v1?.resolver, loaded.state.resolver]);

  return [
    { address: [v1.registry], topics: [topics("Transfer", "NewResolver"), parts.node] },
    { address: [v1.registry], topics: [topics("NewOwner"), parent, parts.labelhash] },
    {
      address: [v1.nameWrapper],
      topics: [topics("NameWrapped", "NameUnwrapped", "FusesSet", "ExpiryExtended"), parts.node],
    },
    { address: [v1.dnsRegistrar], topics: [topics("Claim"), parts.node] },
    { address: resolvers, topics: [nodeKeyedResolverEvents, parts.node] },
    ...(parts.isEth2ld
      ? [
          {
            address: [v1.baseRegistrar],
            topics: [topics("NameRegistered", "NameRenewed", "NameMigrated"), parts.labelhash],
          },
          {
            address: [v1.baseRegistrar],
            topics: [topics("Transfer"), null, null, parts.labelhash],
          },
          {
            address: known([v1.ethRegistrarController, v1.wrappedEthRegistrarController]),
            topics: [topics("NameRegistered", "NameRenewed"), parts.labelhash],
          },
        ]
      : []),
  ];
};

/**
 * ENSv2 logs of a name. Registry events are keyed by token id, which changes whenever the token
 * regenerates, so ids are collected from registrations and `TokenRegenerated` first; resolver
 * events are keyed by record id, collected from `Linked`.
 */
const v2Logs = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  range: BlockRange,
  maxRequests: number | undefined,
): Effect.fn.Return<Log[], AnyError> {
  const v2 = client.deployment.v2;
  const registry = loaded.data.v2?.registry;
  if (v2 === undefined || registry === undefined) return [];
  const { parts } = loaded.data;
  const { state } = loaded;
  const scan = (queries: readonly LogQuery[]) => scanLogs(client, queries, range, { maxRequests });
  const resolver = known([state.resolver]);
  const subregistry = known([state.subregistry]);

  const first = yield* scan([
    {
      address: [registry],
      topics: [topics("LabelRegistered", "LabelReserved"), null, parts.labelhash],
    },
    { address: resolver, topics: [topics("Linked"), null, parts.node] },
    { address: resolver, topics: [nodeKeyedResolverEvents, parts.node] },
    { address: subregistry, topics: [topics("ParentUpdated", "RegistryCreated", "Upgraded")] },
  ]);

  const ids = new Set<bigint>([BigInt(parts.labelhash)]);
  if (state.tokenId !== null) ids.add(state.tokenId);
  const recordIds = new Set<Hex>();
  const linked = topics("Linked")[0];
  for (const log of first) {
    if (isAddressEqual(log.address, registry) && log.topics[1] !== undefined)
      ids.add(BigInt(log.topics[1]));
    if (log.topics[0] === linked && log.topics[1] !== undefined) recordIds.add(log.topics[1]);
  }

  // Follow regenerations until no new token id appears.
  const regenerated: Log[] = [];
  for (let round = 0; round < 8; round += 1) {
    const before = ids.size;
    const idTopics = [...ids].map(word);
    const found = yield* scan([
      { address: [registry], topics: [topics("TokenRegenerated"), idTopics] },
      { address: [registry], topics: [topics("TokenRegenerated"), null, idTopics] },
    ]);
    for (const log of found) {
      for (const topic of log.topics.slice(1)) if (topic !== undefined) ids.add(BigInt(topic));
    }
    regenerated.push(...found);
    if (ids.size === before) break;
  }

  // The record id the resolver uses now, for record events whose `Linked` predates the range.
  const current =
    resolver[0] === undefined
      ? undefined
      : yield* Rpc.readContractOrUndefined(client, {
          address: resolver[0],
          abi: Abis.v2.permissionedResolver,
          functionName: "getRecordId",
          args: [parts.node],
          blockNumber: range.toBlock,
        });
  if (current !== undefined && current !== 0n) recordIds.add(word(current));

  const idTopics = [...ids].map(word);
  const registrars = known([v2.contracts.ethRegistrar, v2.migration.ethRenewerV1]);
  // Transfers have no indexed token id. The `.eth` and root registries are busy: past a short
  // range (a watch, a recent window) only transfers to or from the current owner are scanned.
  const busy =
    isAddressEqual(registry, v2.contracts.ethRegistry) ||
    isAddressEqual(registry, v2.contracts.rootRegistry);
  const owner = state.owner === null ? undefined : (pad(state.owner, { size: 32 }) as Hex);
  const transferTopics = topics("TransferSingle", "TransferBatch");
  const transferQueries: LogQuery[] =
    !busy || range.toBlock - range.fromBlock <= 5_000n
      ? [{ address: [registry], topics: [transferTopics] }]
      : owner === undefined
        ? []
        : [
            { address: [registry], topics: [transferTopics, null, owner] },
            { address: [registry], topics: [transferTopics, null, null, owner] },
          ];
  const second = yield* scan([
    {
      address: [registry],
      topics: [
        topics("LabelUnregistered", "ExpiryUpdated", "SubregistryUpdated", "ResolverUpdated"),
        idTopics,
      ],
    },
    ...(state.resource === null
      ? []
      : [{ address: [registry], topics: [topics("EACRolesChanged"), word(state.resource)] }]),
    ...(parts.isEth2ld
      ? [{ address: registrars, topics: [topics("NameRegistered", "NameRenewed"), idTopics] }]
      : []),
    ...(recordIds.size === 0
      ? []
      : [{ address: resolver, topics: [recordKeyedResolverEvents, [...recordIds]] }]),
    ...transferQueries,
  ]);

  const canonicalIds = new Set([...ids].map(canonical));
  return [
    ...first,
    ...regenerated,
    // Unfiltered transfer scans keep only this name's tokens. TransferSingle data is (id, value);
    // TransferBatch data holds dynamic arrays, so every word is checked.
    ...second.filter(
      (log) =>
        !transferTopics.includes(log.topics[0] as Hex) ||
        (log.data.slice(2).match(/.{64}/g) ?? []).some((part) =>
          canonicalIds.has(canonical(BigInt(`0x${part}`))),
        ),
    ),
  ];
});

/** Every ENS log about `loaded`'s name in `range`, across ENSv1 and ENSv2. */
export const nameLogs = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  range: BlockRange,
  maxRequests: number | undefined,
): Effect.fn.Return<Log[], AnyError> {
  const { v1, v2 } = yield* Effect.all(
    {
      v1: scanLogs(client, v1Queries(client, loaded), range, { maxRequests }),
      v2: v2Logs(client, loaded, range, maxRequests),
    },
    { concurrency: "unbounded" },
  );
  return [...v1, ...v2];
});
