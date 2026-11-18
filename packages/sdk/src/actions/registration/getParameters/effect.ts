import { Effect, Record as Rec, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { tokenInfo } from "../../../internal/registration/payment.js";
import { blockAt } from "../../../internal/rpc/block.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getParameters as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.getParameters`. */
export const getParameters = Effect.fn("ensforge.registration.getParameters")(
  function* (
    client: Client,
    options: Promises.Options = {},
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const contracts = yield* requireRegistrationContracts(client);
    const at = blockAt(options);
    const registrar = { address: contracts.registrar, abi: Abis.v2.ethRegistrar, ...at } as const;
    const listed: readonly Address[] =
      contracts.paymentTokens === undefined ? [] : Rec.values(contracts.paymentTokens);

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
      paymentTokens: Arr.map(
        Arr.filter(parameters.tokens, (token) => token.accepted),
        (token) => token.info,
      ),
    };
  },
  Action.withContext("registration.getParameters", { contractKind: "registrar" }),
);
