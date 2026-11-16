import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { tokenInfo } from "../../../internal/registration/payment.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getParameters as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.getParameters`. */
export const getParameters = Effect.fn("ensforge.registration.getParameters")(
  function* (
    client: Client,
    options: Promises.Options = {},
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const contracts = yield* requireRegistrationContracts(client);
    const at =
      options.blockNumber === undefined
        ? { blockTag: options.blockTag }
        : { blockNumber: options.blockNumber };
    const registrar = { address: contracts.registrar, abi: Abis.v2.ethRegistrar, ...at } as const;
    const listed: readonly Address[] = Object.values(contracts.paymentTokens ?? {});

    const parameters = yield* Effect.all(
      {
        minCommitmentAge: Rpc.readContract(client, {
          ...registrar,
          functionName: "MIN_COMMITMENT_AGE",
        }),
        maxCommitmentAge: Rpc.readContract(client, {
          ...registrar,
          functionName: "MAX_COMMITMENT_AGE",
        }),
        minDuration: Rpc.readContract(client, {
          ...registrar,
          functionName: "MIN_REGISTER_DURATION",
        }),
        gracePeriod: Rpc.readContract(client, { ...registrar, functionName: "GRACE_PERIOD" }),
        tokens: Effect.forEach(
          listed,
          (token) =>
            Effect.all(
              {
                info: tokenInfo(client, token),
                accepted: Rpc.readContract(client, {
                  address: contracts.oracle,
                  abi: Abis.v2.standardRentPriceOracle,
                  functionName: "isPaymentToken",
                  args: [token],
                  ...at,
                }),
              },
              { concurrency: "unbounded" },
            ),
          { concurrency: "unbounded" },
        ),
      },
      { concurrency: "unbounded" },
    );

    return {
      registrar: contracts.registrar,
      renewer: contracts.renewer,
      priceOracle: contracts.oracle,
      minCommitmentAge: parameters.minCommitmentAge,
      maxCommitmentAge: parameters.maxCommitmentAge,
      minDuration: parameters.minDuration,
      gracePeriod: parameters.gracePeriod,
      paymentTokens: parameters.tokens.filter((token) => token.accepted).map((token) => token.info),
    };
  },
  Action.withContext("registration.getParameters", { contractKind: "registrar" }),
);
