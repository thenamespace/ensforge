import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import {
  requireAddress,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { defaultEvmCoinType } from "../../../internal/records/read-profiles.js";
import { readRecords } from "../../../internal/records/read.js";
import { ethCoinType } from "../../../internal/reverse/coin.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { addressOf } from "../../../internal/write/signer.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

/** Fails unless `name` resolves to `address` for `coinType`, so the primary name verifies. */
const requireForwardMatch = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  address: Address,
  coinType: bigint,
): Effect.fn.Return<void, AnyError> {
  const records = yield* readRecords(client, { name, selection: { addresses: [coinType] } });
  const resolved = (records.addresses as Record<string, string | null>)[String(coinType)];
  if (
    resolved === null ||
    resolved === undefined ||
    !isAddressEqual(resolved as Address, address)
  ) {
    return yield* Effect.fail(
      new NotFoundError({
        code: "PRIMARY_NAME_MISMATCH",
        shortMessage: `${name} does not resolve to ${address}.`,
        hint: "Set the name's address record first, or pass `verify: false`.",
      }),
    );
  }
});

/** `addr.reverse`: the v1 ReverseRegistrar, for the signer or an account it may name. */
const ethReverseCall = Effect.fnUntraced(function* (
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
const defaultReverseCall = Effect.fnUntraced(function* (
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

/** @internal Builds the plan of `Actions.primaryName.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined)
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  const target =
    options.address === undefined ? signer : yield* requireAddress(options.address, "address");
  const coinType = options.coin === "default" ? defaultEvmCoinType : ethCoinType;
  const name = options.name === null ? "" : yield* normalizeName(options.name);

  if (name !== "" && options.verify !== false)
    yield* requireForwardMatch(client, name, target, coinType);

  const self = isAddressEqual(target, signer);
  const call =
    coinType === ethCoinType
      ? yield* ethReverseCall(client, target, self, name)
      : yield* defaultReverseCall(client, target, self, name);

  return singleStepPlan(client, {
    operation: "primaryName.set",
    account: options.account,
    description: name === "" ? "Clear primary name" : "Set primary name",
    calls: [call],
  });
});

const write = Action.write("primaryName.set", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.primaryName.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.primaryName.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.primaryName.set`. */
export const setMethods = write.methods;
