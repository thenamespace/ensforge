import { Effect } from "effect";

import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { defaultEvmCoinType } from "../../../internal/records/read-profiles.js";
import { readRecords } from "../../../internal/records/read.js";
import { defaultPrimaryNameCall, ethPrimaryNameCall } from "../../../internal/reverse/calls.js";
import { ethCoinType } from "../../../internal/reverse/coin.js";
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
      ? yield* ethPrimaryNameCall(client, target, self, name)
      : yield* defaultPrimaryNameCall(client, target, self, name);

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
