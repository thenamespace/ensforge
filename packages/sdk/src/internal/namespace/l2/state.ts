import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, maxUint64, type Address } from "viem";

import type { NameStatus } from "../../../actions/name/get/types.js";
import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import { nonZeroAddress } from "../../address.js";
import type { L2Location } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";
import type { RegistryState } from "../../name/state.js";
import * as Rpc from "../../rpc/index.js";

/** What an L2 holds about a name, in `name.get`'s terms. */
export type L2State = Pick<
  RegistryState,
  | "status"
  | "owner"
  | "registry"
  | "resolver"
  | "expiry"
  | "gracePeriodEnd"
  | "tokenId"
  | "wrapped"
  | "available"
  | "renewable"
>;

/** Status from an expiry on the L2's clock; `grace` seconds after it only the holder can renew. */
const statusAt = (now: bigint, expiry: bigint, grace: bigint): NameStatus =>
  now < expiry ? "registered" : now < expiry + grace ? "grace" : "expired";

/** The fields every family fills alike; ensforge neither registers nor renews L2 names. */
const fields = (
  state: Omit<L2State, "available" | "renewable" | "wrapped" | "gracePeriodEnd"> &
    Partial<Pick<L2State, "wrapped" | "gracePeriodEnd">>,
): L2State => ({
  gracePeriodEnd: null,
  wrapped: false,
  ...state,
  available: state.status === "available" || state.status === "expired",
  renewable: false,
});

/** A registry record's resolver, `null` when unset. */
const resolverIn = (client: Client, registry: Address, parts: NameParts) =>
  Rpc.readContract(client, {
    address: registry,
    abi: Abis.v1.ensRegistry,
    functionName: "resolver",
    args: [parts.node],
  }).pipe(Effect.map(nonZeroAddress));

/**
 * Reads a name's owner, expiry and status on its L2 (`client` is on that chain), in one batched
 * round with the L2's block time:
 *
 * - Basenames: the BaseRegistrar holds second-level names (90-day grace); subnames are registry
 *   records without an expiry of their own.
 * - Linea Names: every name is wrapped; the registrar's expiry (90-day grace) for second-level
 *   names, the NameWrapper's for subnames.
 * - Celonames: the registry's `ownerOf` (zero once expired) and `expiries`; no grace.
 * - Durin: the registry's `owner`; names never expire.
 * - Namespace: the parent's registry's `ownerOf` and `expiries`; no grace.
 */
export const readL2State: (
  client: Client,
  location: L2Location,
  parts: NameParts,
) => Effect.Effect<L2State, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  parts: NameParts,
): Effect.fn.Return<L2State, AnyError> {
  const namespaces = client.deployment.namespaces ?? {};
  const now = yield* Rpc.blockTimestamp(client, {});
  const tokenId = hexToBigInt(parts.node);
  // The name's first label sits directly under the namespace's parent.
  const secondLevel = parts.name === `${parts.label}.${location.parent}`;

  switch (location.id) {
    case "basenames": {
      const basenames = namespaces.basenames;
      if (basenames === undefined) return yield* unknownFamily(location);
      const { registry, baseRegistrar } = basenames.contracts;
      const grace = BigInt(basenames.gracePeriod);
      const label = hexToBigInt(parts.labelhash);
      const [manager, resolver, expiry, holder] = yield* Effect.all(
        [
          Rpc.readContract(client, {
            address: registry,
            abi: Abis.v1.ensRegistry,
            functionName: "owner",
            args: [parts.node],
          }),
          resolverIn(client, registry, parts),
          secondLevel
            ? Rpc.readContract(client, {
                address: baseRegistrar,
                abi: Abis.basenames.interfaces.baseRegistrar,
                functionName: "nameExpires",
                args: [label],
              })
            : Effect.succeed(0n),
          // Reverts once the name expires.
          secondLevel
            ? Rpc.readContractOrUndefined(client, {
                address: baseRegistrar,
                abi: Abis.basenames.interfaces.baseRegistrar,
                functionName: "ownerOf",
                args: [label],
              })
            : Effect.undefined,
        ],
        { concurrency: "unbounded" },
      );
      if (!secondLevel) {
        const owner = nonZeroAddress(manager);
        return fields({
          status: owner === null ? "available" : "registered",
          owner,
          registry,
          resolver,
          expiry: null,
          tokenId: null,
        });
      }
      return fields({
        status: expiry === 0n ? "available" : statusAt(now, expiry, grace),
        owner: nonZeroAddress(holder),
        registry,
        resolver,
        expiry: expiry === 0n ? null : expiry,
        gracePeriodEnd: expiry === 0n ? null : expiry + grace,
        tokenId: label,
      });
    }

    case "linea": {
      const linea = namespaces.linea;
      if (linea === undefined) return yield* unknownFamily(location);
      const { registry, baseRegistrar, nameWrapper } = linea.contracts;
      const grace = BigInt(linea.gracePeriod);
      const [[holder, , wrapperExpiry], resolver, registrarExpiry] = yield* Effect.all(
        [
          Rpc.readContract(client, {
            address: nameWrapper,
            abi: Abis.v1.nameWrapper,
            functionName: "getData",
            args: [tokenId],
          }),
          resolverIn(client, registry, parts),
          secondLevel
            ? Rpc.readContract(client, {
                address: baseRegistrar,
                abi: Abis.v1.baseRegistrar,
                functionName: "nameExpires",
                args: [hexToBigInt(parts.labelhash)],
              })
            : Effect.succeed(0n),
        ],
        { concurrency: "unbounded" },
      );
      const owner = nonZeroAddress(holder);
      if (secondLevel) {
        return fields({
          status: registrarExpiry === 0n ? "available" : statusAt(now, registrarExpiry, grace),
          owner,
          registry,
          resolver,
          expiry: registrarExpiry === 0n ? null : registrarExpiry,
          gracePeriodEnd: registrarExpiry === 0n ? null : registrarExpiry + grace,
          tokenId,
          wrapped: true,
        });
      }
      // A wrapped subname keeps the NameWrapper's expiry (capped at its parent's).
      const expiry = wrapperExpiry === 0n || wrapperExpiry >= maxUint64 ? null : wrapperExpiry;
      return fields({
        status:
          owner === null && expiry === null
            ? "available"
            : expiry === null
              ? "registered"
              : statusAt(now, expiry, 0n),
        owner,
        registry,
        resolver,
        expiry,
        tokenId,
        wrapped: owner !== null,
      });
    }

    case "celonames":
    case "namespace": {
      const registry = location.registry;
      if (registry === null) return yield* unknownFamily(location);
      const abi =
        location.id === "celonames"
          ? Abis.celonames.interfaces.registry
          : Abis.namespace.interfaces.ensNameRegistry;
      const resolver =
        location.id === "celonames"
          ? registry
          : (namespaces.namespace?.chains[location.chainId]?.publicResolver ?? null);
      const [holder, expiry] = yield* Effect.all(
        [
          Rpc.readContractOrUndefined(client, {
            address: registry,
            abi,
            functionName: "ownerOf",
            args: [tokenId],
          }),
          Rpc.readContract(client, {
            address: registry,
            abi,
            functionName: "expiries",
            args: [parts.node],
          }),
        ],
        { concurrency: "unbounded" },
      );
      const owner = nonZeroAddress(holder);
      // A Namespace parent's own token never expires.
      const expires = expiry !== 0n && expiry < maxUint64;
      return fields({
        status: expires ? statusAt(now, expiry, 0n) : owner === null ? "available" : "registered",
        owner,
        registry,
        resolver,
        expiry: expires ? expiry : null,
        tokenId,
      });
    }

    default: {
      // Durin.
      const registry = location.registry;
      if (registry === null) return yield* unknownFamily(location);
      const holder = yield* Rpc.readContract(client, {
        address: registry,
        abi: Abis.durin.interfaces.l2Registry,
        functionName: "owner",
        args: [parts.node],
      });
      const owner = nonZeroAddress(holder);
      return fields({
        status: owner === null ? "available" : "registered",
        owner,
        registry,
        resolver: registry,
        expiry: null,
        tokenId,
      });
    }
  }
});

/** A location whose family or registry the client's deployment lacks: nothing to read. */
const unknownFamily = (location: L2Location): Effect.Effect<L2State> =>
  Effect.succeed(
    fields({
      status: "available",
      owner: null,
      registry: location.registry,
      resolver: null,
      expiry: null,
      tokenId: null,
    }),
  );
