import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { parseEthName } from "../../../internal/registration/labels.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { isAvailable as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.isAvailable`. */
export const isAvailable = Effect.fn("ensforge.registration.isAvailable")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const { label } = yield* parseEthName(options.name);
    const contracts = yield* requireRegistrationContracts(client);
    const at =
      options.blockNumber === undefined
        ? { blockTag: options.blockTag }
        : { blockNumber: options.blockNumber };

    // The registrar answers for every name, including expired ENSv1 names; the oracle rejects
    // labels that cannot be sold at all (too short).
    const { available, valid } = yield* Effect.all(
      {
        available: Rpc.readContract(client, {
          address: contracts.registrar,
          abi: Abis.v2.ethRegistrar,
          functionName: "isAvailable",
          args: [label],
          ...at,
        }),
        valid: Rpc.readContract(client, {
          address: contracts.oracle,
          abi: Abis.v2.standardRentPriceOracle,
          functionName: "isValid",
          args: [label],
          ...at,
        }),
      },
      { concurrency: "unbounded" },
    );
    return available && valid;
  },
  Action.withContext("registration.isAvailable", { contractKind: "registrar" }),
);
