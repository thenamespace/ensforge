import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { parseEthName } from "../../../internal/registration/labels.js";
import { acceptedTokenInfo, paymentTokenAddress } from "../../../internal/registration/payment.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getPrice as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.getPrice`. */
export const getPrice = Effect.fn("ensforge.registration.getPrice")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const contracts = yield* requireRegistrationContracts(client);
    const { label, labelhash } = yield* parseEthName(options.name);
    const token = yield* paymentTokenAddress(contracts, options.paymentToken);
    const at =
      options.blockNumber === undefined
        ? { blockTag: options.blockTag }
        : { blockNumber: options.blockNumber };

    const { state, gracePeriod, minDuration, now, info } = yield* Effect.all(
      {
        state: Rpc.readContract(client, {
          address: contracts.ethRegistry,
          abi: Abis.v2.permissionedRegistry,
          functionName: "getState",
          args: [hexToBigInt(labelhash)],
          ...at,
        }),
        gracePeriod: Rpc.readContract(client, {
          address: contracts.registrar,
          abi: Abis.v2.ethRegistrar,
          functionName: "GRACE_PERIOD",
          ...at,
        }),
        minDuration: Rpc.readContract(client, {
          address: contracts.registrar,
          abi: Abis.v2.ethRegistrar,
          functionName: "MIN_REGISTER_DURATION",
          ...at,
        }),
        now: Rpc.blockTimestamp(client, options),
        info: acceptedTokenInfo(client, contracts, token),
      },
      { concurrency: "unbounded" },
    );
    if (options.duration < minDuration) {
      return yield* Effect.fail(
        new InvalidInputError({ code: "DURATION_TOO_SHORT", input: options.duration }),
      );
    }

    // The registrar prices a name by how long it has been available (ETHRegistrar
    // `_availablePeriod`); computing that period for `at` gives the premium at a future time.
    const time = options.at ?? now;
    const end = state.expiry + gracePeriod;
    const availableFor = state.expiry === 0n ? time : time > end ? time - end : 0n;
    const [base, premium] = yield* Rpc.readContract(client, {
      address: contracts.oracle,
      abi: Abis.v2.standardRentPriceOracle,
      functionName: "getRegisterPrice",
      args: [label, availableFor, options.duration, token],
      ...at,
    });

    return { base, premium, total: base + premium, token: info };
  },
  Action.withContext("registration.getPrice", { contractKind: "registrar" }),
);
