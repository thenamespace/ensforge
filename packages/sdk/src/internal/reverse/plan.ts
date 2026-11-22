import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { standaloneHcaFactoryV2InterfaceAbi } from "@ensforge/contracts/v2/experimental/hca";
import { isAddressEqual, zeroAddress, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { namehash } from "../../utils/Name.js";
import { requireV1Contracts } from "../name/write.js";
import * as Rpc from "../rpc/index.js";
import { defaultNameCall, ethClearCall, ethNameCalls, hcaCalls } from "./calls.js";
import { ethCoinType, reverseName } from "./coin.js";

/** Which reverse record a write is for: `addr.reverse`, `default.reverse`, or both. */
export type ReverseScope = "eth" | "default" | "all";

/** A reverse write: calls the sender runs (one HCA execution when routed), and the signer's own. */
export type ReversePlan = {
  readonly calls: readonly Plan.Call[];
  /** Calls only the signer can send: `msg.sender`-keyed, with no HCA entry point. */
  readonly signerCalls: readonly Plan.Call[];
  readonly warnings: readonly Plan.Warning[];
};

/**
 * The resolver on `target`'s `addr.reverse` node and its name. On Ethereum, a node with a
 * resolver answers from it, even with an empty name; only a node without one falls back to the
 * `default.reverse` name (the Universal Resolver walks up to the `reverse` resolver).
 */
const addrReverseShadow = Effect.fnUntraced(function* (client: Client, target: Address) {
  const v1 = yield* requireV1Contracts(client);
  const node = namehash(reverseName(target, ethCoinType));
  const resolver = yield* Rpc.readContract(client, {
    address: v1.registry,
    abi: Abis.v1.ensRegistry,
    functionName: "resolver",
    args: [node],
  });
  if (isAddressEqual(resolver, zeroAddress)) return undefined;
  // A resolver without `name` (or reverting) hides the default all the same.
  const name = yield* Rpc.readContractOrUndefined(client, {
    address: resolver,
    abi: Abis.v1.publicResolver,
    functionName: "name",
    args: [node],
  });
  return { name: name ?? null };
});

/** Whether `sender` is the HCA `signer` owns: the adapters accept it through their HCA entry points. */
const isHcaOf = Effect.fnUntraced(function* (client: Client, sender: Address, signer: Address) {
  const adapter = client.deployment.v2?.contracts.defaultReverseRegistrarAdapter;
  if (adapter === undefined) return false;
  const factory = yield* Rpc.readContract(client, {
    address: adapter,
    abi: Abis.v2.defaultReverseRegistrarAdapter,
    functionName: "STANDALONE_HCA_FACTORY",
  });
  // A counterfactual HCA has no authorized owner yet.
  const owner = yield* Rpc.readContractOrUndefined(client, {
    address: factory,
    abi: standaloneHcaFactoryV2InterfaceAbi,
    functionName: "authorizedOwnerOf",
    args: [sender],
  });
  return owner !== undefined && isAddressEqual(owner, signer);
});

/**
 * The calls that set (`name`) or clear (`""`) `target`'s primary name in `scope`, sent by `sender`
 * (the signer, or the account a route sends as).
 *
 * - `"eth"` writes `addr.reverse`; clearing removes the node's resolver, so the `default.reverse`
 *   name applies on Ethereum again.
 * - `"default"` writes `default.reverse`; setting it also clears an `addr.reverse` entry holding
 *   another name, which would hide it on Ethereum. Clearing leaves `addr.reverse` alone.
 * - `"all"` sets like `"default"`, and clears both.
 *
 * Through the signer's HCA the adapters' HCA entry points are used; an `addr.reverse` name has
 * none, so it goes to the signer. A route that is not the signer's (deployed) HCA cannot name the
 * signer, so its calls go to the signer too, with a warning.
 */
export const reverseCalls = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly target: Address;
    readonly signer: Address;
    readonly sender: Address;
    readonly scope: ReverseScope;
    readonly name: string;
  },
): Effect.fn.Return<ReversePlan, AnyError> {
  const { target, signer, scope, name } = options;
  const routedForSigner = !isAddressEqual(options.sender, signer) && isAddressEqual(target, signer);
  const viaHca = routedForSigner && (yield* isHcaOf(client, options.sender, signer));
  const toSigner: Plan.Warning = {
    code: "PRIMARY_NAME_ROUTED_TO_SIGNER",
    message: "Only the signer can make this reverse record change, so the wallet sends it itself.",
  };
  const set = name !== "";
  const shadow =
    scope === "eth" || (scope === "default" && !set)
      ? undefined
      : yield* addrReverseShadow(client, target);
  // Setting the default clears an entry with another name; clearing everything clears any entry.
  const clearShadow = shadow !== undefined && (set ? shadow.name !== name : scope === "all");

  if (viaHca) {
    const hca = yield* hcaCalls(client);
    if (scope === "eth" && set) {
      return {
        calls: [],
        signerCalls: yield* ethNameCalls(client, target, signer, name),
        warnings: [toSigner],
      };
    }
    return {
      calls: [
        ...(scope === "eth" ? [] : [hca.defaultName(target, name)]),
        ...(scope === "eth" || clearShadow ? [hca.ethClear(target)] : []),
      ],
      signerCalls: [],
      warnings: [],
    };
  }

  // A route that is not the signer's HCA sends as another account, which cannot name the signer.
  const sender = routedForSigner ? signer : options.sender;
  const calls =
    scope === "eth"
      ? set
        ? yield* ethNameCalls(client, target, sender, name)
        : [yield* ethClearCall(client, target, sender)]
      : [
          yield* defaultNameCall(client, target, sender, name),
          // Authorised like the default write: self, Ownable owner or ContractNamer.
          ...(clearShadow ? [yield* ethClearCall(client, target, sender, "namer")] : []),
        ];
  return routedForSigner
    ? { calls: [], signerCalls: calls, warnings: [toSigner] }
    : { calls, signerCalls: [], warnings: [] };
});
