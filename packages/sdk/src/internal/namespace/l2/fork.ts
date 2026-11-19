import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, isAddressEqual, zeroAddress, type Address } from "viem";

import type { Authority } from "../../../actions/permission/get/types.js";
import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import { nonZeroAddress } from "../../address.js";
import { l2RefusalAt, type L2Location, type L2WriteTarget } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";
import { requireAddress } from "../../name/write.js";
import * as Rpc from "../../rpc/index.js";

/**
 * The contracts of the L2 namespaces that fork ENSv1 (Basenames, Linea Names), whose names take
 * ENS's registry and NameWrapper calls.
 */
export type ForkContracts = {
  readonly registry: Address;
  /** Linea Names' NameWrapper; Basenames has none. */
  readonly nameWrapper: Address | undefined;
  /** The family's current resolver: new names get it, and `"default"` means it. */
  readonly resolver: Address;
};

/** The ENSv1-fork contracts of a name's family (`client` is on its L2), or `null` for others. */
export const forkContractsOf = (client: Client, location: L2Location): ForkContracts | null => {
  const namespaces = client.deployment.namespaces ?? {};
  switch (location.id) {
    case "basenames": {
      const contracts = namespaces.basenames?.contracts;
      return contracts === undefined
        ? null
        : { registry: contracts.registry, nameWrapper: undefined, resolver: contracts.resolver };
    }
    case "linea": {
      const contracts = namespaces.linea?.contracts;
      return contracts === undefined
        ? null
        : {
            registry: contracts.registry,
            nameWrapper: contracts.nameWrapper,
            resolver: contracts.resolver,
          };
    }
    default:
      return null;
  }
};

/** Who controls a fork name, as its registry or NameWrapper checks it. */
export type ForkControl = {
  /** The registry owner, or the NameWrapper's owner of a wrapped name. */
  readonly owner: Address | null;
  /** The contract that checks it: the NameWrapper for a wrapped name, else the registry. */
  readonly contract: Address;
  readonly wrapped: boolean;
  /** Fuses burned on a wrapped name; `0` otherwise. */
  readonly fuses: number;
  /** How `account` controls it, or `null`. */
  readonly via: Authority | null;
};

/**
 * Who controls a Basenames or Linea name (`client` is on its L2): the registry owner, or for a
 * name the NameWrapper holds its owner there, and the operators each contract records.
 */
export const forkControl: (
  client: Client,
  contracts: ForkContracts,
  parts: NameParts,
  account: Address,
) => Effect.Effect<ForkControl, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  contracts: ForkContracts,
  parts: NameParts,
  account: Address,
): Effect.fn.Return<ForkControl, AnyError> {
  const registryOwner = yield* Rpc.readContract(client, {
    address: contracts.registry,
    abi: Abis.v1.ensRegistry,
    functionName: "owner",
    args: [parts.node],
  });
  const manager = nonZeroAddress(registryOwner);
  const { nameWrapper } = contracts;
  const wrapped =
    manager !== null && nameWrapper !== undefined && isAddressEqual(manager, nameWrapper);

  const [owner, fuses] = wrapped
    ? yield* Rpc.readContract(client, {
        address: nameWrapper,
        abi: Abis.v1.nameWrapper,
        functionName: "getData",
        args: [hexToBigInt(parts.node)],
      }).pipe(Effect.map(([holder, burned]) => [nonZeroAddress(holder), burned] as const))
    : [manager, 0];
  const contract = wrapped ? nameWrapper : contracts.registry;
  if (owner === null) return { owner, contract, wrapped, fuses, via: null };
  if (isAddressEqual(owner, account)) return { owner, contract, wrapped, fuses, via: "owner" };

  // `isApprovedForAll(owner, operator)` has the same selector on the registry and the NameWrapper.
  const operator = yield* Rpc.readContract(client, {
    address: contract,
    abi: Abis.v1.ensRegistry,
    functionName: "isApprovedForAll",
    args: [owner, account],
  });
  return { owner, contract, wrapped, fuses, via: operator ? "operator" : null };
});

/**
 * The resolver a fork name may point at: `"default"` is the family's current resolver, `null`
 * none. Linea Names' Ethereum resolver proves records from Linea's PublicResolver alone, so a
 * Linea name accepts no other: it would stop resolving from Ethereum.
 */
export const forkResolver = (
  location: L2Location,
  contracts: ForkContracts,
  resolver: string | null,
): Effect.Effect<Address, AnyError> => {
  const requested =
    resolver === "default"
      ? Effect.succeed(contracts.resolver)
      : resolver === null
        ? Effect.succeed(zeroAddress)
        : requireAddress(resolver, "resolver");
  if (location.id !== "linea") return requested;
  return requested.pipe(
    Effect.filterOrFail(
      (address) => isAddressEqual(address, contracts.resolver),
      () =>
        new UnsupportedError({
          code: "UNSUPPORTED_ON_DEPLOYMENT",
          feature: "Other resolvers on Linea Names",
          shortMessage:
            "Linea Names resolve from Ethereum only through Linea's PublicResolver; another resolver would stop the name resolving.",
          hint: 'Use `resolver: "default"`.',
          context: { contract: contracts.resolver, chainId: location.chainId },
        }),
    ),
  );
};

/**
 * Where a write on a Basenames or Linea name goes (`target.client` is on its L2): its fork
 * contracts and the contract its calls are sent to, the NameWrapper for a wrapped name. Names of
 * other families are refused, saying where they live.
 */
export const forkTarget = (
  target: L2WriteTarget,
  parts: NameParts,
): Effect.Effect<{ readonly contracts: ForkContracts; readonly to: Address }, AnyError> => {
  const contracts = forkContractsOf(target.client, target.location);
  if (contracts === null) {
    return Effect.fail(l2RefusalAt(target.client, target.location, parts));
  }
  const to =
    target.state.wrapped && contracts.nameWrapper !== undefined
      ? contracts.nameWrapper
      : contracts.registry;
  return Effect.succeed({ contracts, to });
};
