import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, zeroAddress, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { namehash } from "../../utils/Name.js";
import { requireV1Contracts } from "../name/write.js";
import * as Rpc from "../rpc/index.js";
import { ethCoinType, reverseName } from "./coin.js";

const call = (to: Address, data: `0x${string}`): Plan.Call => ({ to, data, value: 0n });

/**
 * How `sender` may write `target`'s `addr.reverse` record: as the address itself; through the v1
 * ReverseRegistrar, as its registry operator, a registrar controller or (for a contract) its
 * Ownable owner; or, for a contract, as its ENSv2 ContractNamer through the adapter.
 */
const ethAuthority = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  sender: Address,
): Effect.fn.Return<"self" | "registrar" | "namer", AnyError> {
  if (isAddressEqual(target, sender)) return "self";

  const v1 = yield* requireV1Contracts(client);
  const [operator, controller, contract] = yield* Effect.all(
    [
      Rpc.readContract(client, {
        address: v1.registry,
        abi: Abis.v1.ensRegistry,
        functionName: "isApprovedForAll",
        args: [target, sender],
      }),
      Rpc.readContract(client, {
        address: v1.reverseRegistrar,
        abi: Abis.v1.reverseRegistrar,
        functionName: "controllers",
        args: [sender],
      }),
      Rpc.hasCode(client, target),
    ],
    { concurrency: "unbounded" },
  );
  // A contract without `owner()` or `isContractNamer` reverts, or answers nothing from a fallback
  // (a Safe): it names nobody.
  const [owner, namer] = contract
    ? yield* Effect.all(
        [
          Rpc.readContractOrUndefined(client, {
            address: target,
            abi: Abis.v2.contractNamer,
            functionName: "owner",
          }),
          Rpc.readContractOrUndefined(client, {
            address: target,
            abi: Abis.v2.contractNamer,
            functionName: "isContractNamer",
            args: [sender],
          }),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchIf(
          (error: AnyError) => error.code === "CONTRACT_NOT_DEPLOYED",
          () => Effect.succeed([undefined, false] as const),
        ),
      )
    : [undefined, false];

  if (operator || controller || (owner !== undefined && isAddressEqual(owner, sender))) {
    return "registrar";
  }
  if (namer === true) return "namer";
  return yield* Effect.fail(
    new UnauthorizedError({
      code: "NOT_APPROVED",
      account: sender,
      shortMessage: `${sender} may not set the primary name of ${target}.`,
      hint: "Send from the address itself, its registry operator, or for a contract its Ownable owner or ContractNamer.",
    }),
  );
});

const requireAdapter = (
  client: Client,
  key: "reverseRegistrarAdapter" | "defaultReverseRegistrarAdapter",
  feature: string,
): Effect.Effect<Address, AnyError> => {
  const adapter = client.deployment.v2?.contracts[key];
  return adapter === undefined
    ? Effect.fail(new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature }))
    : Effect.succeed(adapter);
};

/**
 * Sets `target`'s `addr.reverse` name, as `sender`. The v1 ReverseRegistrar names the sender
 * itself, or an address it is authorised for. A contract's ENSv2 ContractNamer instead claims
 * its reverse node through the adapter, which makes the sender the node's owner, then sets the
 * name on the node's resolver: two dependent calls.
 */
export const ethNameCalls = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  sender: Address,
  name: string,
): Effect.fn.Return<Plan.Call[], AnyError> {
  const v1 = yield* requireV1Contracts(client);
  const authority = yield* ethAuthority(client, target, sender);
  if (authority === "self") {
    return [
      call(
        v1.reverseRegistrar,
        encodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          functionName: "setName",
          args: [name],
        }),
      ),
    ];
  }

  const resolver = yield* Rpc.readContract(client, {
    address: v1.reverseRegistrar,
    abi: Abis.v1.reverseRegistrar,
    functionName: "defaultResolver",
  });
  if (authority === "registrar") {
    return [
      call(
        v1.reverseRegistrar,
        encodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          functionName: "setNameForAddr",
          args: [target, target, resolver, name],
        }),
      ),
    ];
  }
  const adapter = yield* requireAdapter(
    client,
    "reverseRegistrarAdapter",
    "Primary names set by a ContractNamer",
  );
  return [
    call(
      adapter,
      encodeFunctionData({
        abi: Abis.v2.reverseRegistrarAdapter,
        functionName: "claim",
        args: [target, resolver],
      }),
    ),
    call(
      resolver,
      encodeFunctionData({
        abi: Abis.v1.publicResolver,
        functionName: "setName",
        args: [namehash(reverseName(target, ethCoinType)), name],
      }),
    ),
  ];
});

/**
 * Clears `target`'s `addr.reverse` record, as `sender`, by removing its node's resolver: a node
 * with a resolver, even one answering an empty name, hides the `default.reverse` name on
 * Ethereum. `namer` uses the adapter's account-namer rule (self, Ownable owner or ContractNamer),
 * the rule `default.reverse` writes for other accounts follow.
 */
export const ethClearCall = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  sender: Address,
  rule: "registrar" | "namer" = "registrar",
): Effect.fn.Return<Plan.Call, AnyError> {
  const v1 = yield* requireV1Contracts(client);
  const authority = isAddressEqual(target, sender)
    ? "self"
    : rule === "namer"
      ? "namer"
      : yield* ethAuthority(client, target, sender);
  if (authority === "self") {
    return call(
      v1.reverseRegistrar,
      encodeFunctionData({
        abi: Abis.v1.reverseRegistrar,
        functionName: "claimWithResolver",
        args: [target, zeroAddress],
      }),
    );
  }
  if (authority === "registrar") {
    return call(
      v1.reverseRegistrar,
      encodeFunctionData({
        abi: Abis.v1.reverseRegistrar,
        functionName: "claimForAddr",
        args: [target, target, zeroAddress],
      }),
    );
  }
  const adapter = yield* requireAdapter(
    client,
    "reverseRegistrarAdapter",
    "Primary names set by a ContractNamer",
  );
  return call(
    adapter,
    encodeFunctionData({
      abi: Abis.v2.reverseRegistrarAdapter,
      functionName: "claim",
      args: [target, zeroAddress],
    }),
  );
});

/** `default.reverse`: the v1 DefaultReverseRegistrar for the sender itself, else the ENSv2 adapter. */
export const defaultNameCall = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  sender: Address,
  name: string,
): Effect.fn.Return<Plan.Call, AnyError> {
  if (isAddressEqual(target, sender)) {
    return call(
      (yield* requireV1Contracts(client)).defaultReverseRegistrar,
      encodeFunctionData({
        abi: Abis.v1.defaultReverseRegistrar,
        functionName: "setName",
        args: [name],
      }),
    );
  }

  // The registrar only lets controllers name other accounts; the adapter is one, and allows
  // the account's Ownable owner or ContractNamer.
  const adapter = yield* requireAdapter(
    client,
    "defaultReverseRegistrarAdapter",
    "Default primary names for other accounts",
  );
  return call(
    adapter,
    encodeFunctionData({
      abi: Abis.v2.defaultReverseRegistrarAdapter,
      functionName: "setName",
      args: [target, name],
    }),
  );
});

/**
 * The adapters' HCA entry points, which `owner`'s HCA calls: `default.reverse` names, and the
 * `addr.reverse` clear. No HCA entry point writes an `addr.reverse` name.
 */
export const hcaCalls = Effect.fnUntraced(function* (client: Client) {
  const [defaultAdapter, adapter] = yield* Effect.all(
    [
      requireAdapter(client, "defaultReverseRegistrarAdapter", "Primary names through an HCA"),
      requireAdapter(client, "reverseRegistrarAdapter", "Primary names through an HCA"),
    ],
    { concurrency: 1 },
  );
  return {
    defaultName: (owner: Address, name: string) =>
      call(
        defaultAdapter,
        encodeFunctionData({
          abi: Abis.v2.defaultReverseRegistrarAdapter,
          functionName: "setNameWithHCA",
          args: [owner, name],
        }),
      ),
    ethClear: (owner: Address) =>
      call(
        adapter,
        encodeFunctionData({
          abi: Abis.v2.reverseRegistrarAdapter,
          functionName: "claimWithHCA",
          args: [owner, zeroAddress],
        }),
      ),
  };
});
