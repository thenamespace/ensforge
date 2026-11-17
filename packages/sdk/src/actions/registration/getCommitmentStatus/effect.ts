import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { isHex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getCommitmentStatus as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.getCommitmentStatus`. */
export const getCommitmentStatus = Effect.fn("ensforge.registration.getCommitmentStatus")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    if (!isHex(options.commitment) || options.commitment.length !== 66) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "commitment",
          input: options.commitment,
        }),
      );
    }

    const contracts = yield* requireRegistrationContracts(client);
    const at =
      options.blockNumber === undefined
        ? { blockTag: options.blockTag }
        : { blockNumber: options.blockNumber };
    const registrar = { address: contracts.registrar, abi: Abis.v2.ethRegistrar, ...at } as const;
    const { committedAt, minAge, maxAge, now } = yield* Effect.all(
      {
        committedAt: Rpc.readContract(client, {
          ...registrar,
          functionName: "commitmentAt",
          args: [options.commitment],
        }),
        minAge: Rpc.readContract(client, { ...registrar, functionName: "MIN_COMMITMENT_AGE" }),
        maxAge: Rpc.readContract(client, { ...registrar, functionName: "MAX_COMMITMENT_AGE" }),
        now: Rpc.blockTimestamp(client, options),
      },
      { concurrency: "unbounded" },
    );

    // A commitment is deleted when it is used, so `unknown` covers both "never made" and "used".
    if (committedAt === 0n) {
      return { status: "unknown", committedAt: null, readyAt: null, expiresAt: null };
    }
    const readyAt = committedAt + minAge;
    const expiresAt = committedAt + maxAge;
    const status = now < readyAt ? "pending" : now < expiresAt ? "ready" : "expired";
    return { status, committedAt, readyAt, expiresAt };
  },
  Action.withContext("registration.getCommitmentStatus", { contractKind: "registrar" }),
);
