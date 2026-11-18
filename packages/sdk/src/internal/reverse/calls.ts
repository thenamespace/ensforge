import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { namehash } from "../../utils/Name.js";
import { requireV1Contracts } from "../name/write.js";
import * as Rpc from "../rpc/index.js";
import { ethCoinType, reverseName } from "./coin.js";

/**
 * `addr.reverse`: the v1 ReverseRegistrar names the signer, or an address whose registry operator,
 * registrar controller or (for a contract) Ownable owner the signer is. A contract's ENSv2
 * ContractNamer instead claims its reverse node through the ENSv2 adapter, which makes the signer
 * the node's owner, then sets the name on the node's resolver: two dependent calls.
 */
export const ethPrimaryNameCalls = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  signer: Address,
  name: string,
): Effect.fn.Return<Plan.Call[], AnyError> {
  const v1 = yield* requireV1Contracts(client);
  if (isAddressEqual(target, signer)) {
    return [
      {
        to: v1.reverseRegistrar,
        data: encodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          functionName: "setName",
          args: [name],
        }),
        value: 0n,
      },
    ];
  }

  const [resolver, operator, controller, contract] = yield* Effect.all(
    [
      Rpc.readContract(client, {
        address: v1.reverseRegistrar,
        abi: Abis.v1.reverseRegistrar,
        functionName: "defaultResolver",
      }),
      Rpc.readContract(client, {
        address: v1.registry,
        abi: Abis.v1.ensRegistry,
        functionName: "isApprovedForAll",
        args: [target, signer],
      }),
      Rpc.readContract(client, {
        address: v1.reverseRegistrar,
        abi: Abis.v1.reverseRegistrar,
        functionName: "controllers",
        args: [signer],
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
            args: [signer],
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

  if (operator || controller || (owner !== undefined && isAddressEqual(owner, signer))) {
    return [
      {
        to: v1.reverseRegistrar,
        data: encodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          functionName: "setNameForAddr",
          args: [target, target, resolver, name],
        }),
        value: 0n,
      },
    ];
  }
  if (namer !== true) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "NOT_APPROVED",
        account: signer,
        shortMessage: `${signer} may not set the primary name of ${target}.`,
        hint: "Send from the address itself, its registry operator, or for a contract its Ownable owner or ContractNamer.",
      }),
    );
  }

  const adapter = client.deployment.v2?.contracts.reverseRegistrarAdapter;
  if (adapter === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_ON_DEPLOYMENT",
        feature: "Primary names set by a ContractNamer",
      }),
    );
  }
  return [
    {
      to: adapter,
      data: encodeFunctionData({
        abi: Abis.v2.reverseRegistrarAdapter,
        functionName: "claim",
        args: [target, resolver],
      }),
      value: 0n,
    },
    {
      to: resolver,
      data: encodeFunctionData({
        abi: Abis.v1.publicResolver,
        functionName: "setName",
        args: [namehash(reverseName(target, ethCoinType)), name],
      }),
      value: 0n,
    },
  ];
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
