import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { requireV1Contracts } from "../name/write.js";
import * as Rpc from "../rpc/index.js";

/** `addr.reverse`: the v1 ReverseRegistrar, for the signer or an account it may name. */
export const ethPrimaryNameCall = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  self: boolean,
  name: string,
): Effect.fn.Return<Plan.Call, AnyError> {
  const registrar = (yield* requireV1Contracts(client)).reverseRegistrar;
  if (self) {
    return {
      to: registrar,
      data: encodeFunctionData({
        abi: Abis.v1.reverseRegistrar,
        functionName: "setName",
        args: [name],
      }),
      value: 0n,
    };
  }

  // Another address keeps ownership of its reverse node; the signer must be its operator or,
  // for a contract, its Ownable owner.
  const resolver = yield* Rpc.readContract(client, {
    address: registrar,
    abi: Abis.v1.reverseRegistrar,
    functionName: "defaultResolver",
  });
  return {
    to: registrar,
    data: encodeFunctionData({
      abi: Abis.v1.reverseRegistrar,
      functionName: "setNameForAddr",
      args: [target, target, resolver, name],
    }),
    value: 0n,
  };
});

/** `default.reverse`: the v1 DefaultReverseRegistrar for the signer, else the ENSv2 adapter. */
export const defaultPrimaryNameCall = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  self: boolean,
  name: string,
): Effect.fn.Return<Plan.Call, AnyError> {
  if (self) {
    return {
      to: (yield* requireV1Contracts(client)).defaultReverseRegistrar,
      data: encodeFunctionData({
        abi: Abis.v1.defaultReverseRegistrar,
        functionName: "setName",
        args: [name],
      }),
      value: 0n,
    };
  }

  // The registrar only lets controllers name other accounts; the adapter is one, and allows
  // the account's Ownable owner or ContractNamer.
  const adapter = client.deployment.v2?.contracts.defaultReverseRegistrarAdapter;
  if (adapter === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_ON_DEPLOYMENT",
        feature: "Default primary names for other accounts",
      }),
    );
  }
  return {
    to: adapter,
    data: encodeFunctionData({
      abi: Abis.v2.defaultReverseRegistrarAdapter,
      functionName: "setName",
      args: [target, name],
    }),
    value: 0n,
  };
});
