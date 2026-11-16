import { Effect } from "effect";

import { hexToBigInt, isHex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import { labelStoreAbi } from "../../../internal/abis/v2.js";
import * as Action from "../../../internal/action/index.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getLabel as Promises } from "./index.js";

/** @internal Implementation of `Actions.name.getLabel`. */
export const getLabel = Effect.fn("ensforge.name.getLabel")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  if (!isHex(options.labelhash) || options.labelhash.length !== 66) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "labelhash",
        input: options.labelhash,
      }),
    );
  }

  const labelStore = client.deployment.v2?.contracts.labelStore;
  if (labelStore === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "LabelStore" }),
    );
  }

  const label = yield* Rpc.readContract(client, {
    address: labelStore,
    abi: labelStoreAbi,
    functionName: "getLabel",
    args: [hexToBigInt(options.labelhash)],
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  });

  return label === "" ? null : label;
}, Action.withContext("name.getLabel"));
