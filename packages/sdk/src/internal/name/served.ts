import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";
import { call } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { nonZeroAddress } from "../address.js";
import { describeResolver, knownKind } from "../resolver/describe.js";
import { behindEnsV1Bridge, servingResolver, type ServingResolver } from "../resolver/serving.js";
import * as Rpc from "../rpc/index.js";
import type { LoadedName } from "./load.js";
import type { NameParts } from "./parts.js";

/** How a parent's resolver serves a name that no registry holds. */
export type ServedKind = "offchain" | "wildcard";

/** A name no registry holds that a parent's resolver serves. */
export type ServedName = { readonly kind: ServedKind; readonly resolver: Address };

/**
 * The resolver serving a name without one of its own, from what `findResolver` returned: the
 * ENSv1 resolver behind the ENSv1 bridge or a DNS TLD resolver, or a parent's resolver when it is
 * an ENSIP-10 extended resolver (a parent's resolver serves its children only through `resolve`).
 */
export const inheritedResolver = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  found: Rpc.FoundResolver | null,
  block: Read.BlockOptions,
): Effect.fn.Return<ServingResolver | null, AnyError> {
  let served = yield* servingResolver(client, parts.name, found, block);
  // ENSv2's DNS TLD resolvers answer with the ENSv1 resolver of the name or an ancestor when
  // there is one (`cb.id` under `id`), and with DNSSEC otherwise.
  if (served !== null && knownKind(client, served.address) === "dns") {
    const v1 = yield* behindEnsV1Bridge(client, parts.name, block);
    if (v1 !== null && knownKind(client, v1.address) !== "dns") served = v1;
  }
  if (served === null || !served.inherited) return served;

  const { profiles } = yield* describeResolver(client, served.address, parts.node, block);
  return profiles.extended ? served : null;
});

/**
 * Whether a parent's extended resolver actually serves `parts`: an `OffchainLookup` means a
 * gateway answers for it (`offchain`, whether or not the gateway knows the label); an `addr` on
 * chain means an on-chain wildcard (`wildcard`). Anything else is not served: ENSv2 resolvers
 * declare ENSIP-10 without answering for labels their registry does not hold. One `eth_call`
 * with CCIP-Read off, so no gateway is contacted. ENS's DNS resolvers are skipped: a DNS name
 * without an ENS record is claimed with `dns.claim`, so it stays `available`.
 */
export const probeServed = (
  client: Client,
  parts: NameParts,
  resolver: Address,
  block: Read.BlockOptions,
): Effect.Effect<ServedKind | null, AnyError> =>
  knownKind(client, resolver) === "dns"
    ? Effect.succeed(null)
    : probe(client, parts, resolver, block);

const probe = (
  client: Client,
  parts: NameParts,
  resolver: Address,
  block: Read.BlockOptions,
): Effect.Effect<ServedKind | null, AnyError> =>
  Rpc.fromPromise(
    (signal) =>
      // viem follows CCIP-Read unless the client disables it, so the probe uses a copy that does.
      call(
        { ...client.client(), ccipRead: false },
        {
          to: resolver,
          data: encodeFunctionData({
            abi: Abis.shared.extendedResolver,
            functionName: "resolve",
            args: [
              parts.dns,
              encodeFunctionData({
                abi: Abis.shared.addrResolver,
                functionName: "addr",
                args: [parts.node],
              }),
            ],
          }),
          requestOptions: { signal },
          ...(block.blockNumber === undefined
            ? { blockTag: block.blockTag ?? client.config.blockTag }
            : { blockNumber: block.blockNumber }),
        },
      ),
    { contract: resolver, functionName: "resolve" },
  ).pipe(
    Effect.map(({ data }): ServedKind | null => (servesAddress(data) ? "wildcard" : null)),
    Effect.catchIf(
      (error: AnyError) => error.context.revert !== undefined,
      (error) =>
        Effect.succeed<ServedKind | null>(
          error.context.revert?.errorName === "OffchainLookup" ? "offchain" : null,
        ),
    ),
  );

// A resolver may answer `resolve` with anything; only a well-formed, non-zero `addr` counts.
const servesAddress = (data: Hex | undefined): boolean => {
  if (data === undefined || data === "0x") return false;
  try {
    const encoded = decodeFunctionResult({
      abi: Abis.shared.extendedResolver,
      functionName: "resolve",
      data,
    });
    if (encoded === "0x") return false;
    const address = decodeFunctionResult({
      abi: Abis.shared.addrResolver,
      functionName: "addr",
      data: encoded,
    });
    return nonZeroAddress(address) !== null;
  } catch {
    return false;
  }
};

/**
 * For a loaded name no registry holds, whether a parent's resolver serves it; `null` for names a
 * registry holds or nothing serves. Write planners call it only on their failure path, so
 * registered names cost no extra reads.
 */
export const servedName = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  block: Read.BlockOptions = {},
): Effect.fn.Return<ServedName | null, AnyError> {
  if (loaded.kind !== "available") return null;

  const { parts } = loaded.data;
  const found = yield* Rpc.findResolver(client, { name: parts.name, ...block });
  const served = yield* inheritedResolver(client, parts, found, block);
  if (served === null || !served.inherited) return null;

  const kind = yield* probeServed(client, parts, served.address, block);
  return kind === null ? null : { kind, resolver: served.address };
});
