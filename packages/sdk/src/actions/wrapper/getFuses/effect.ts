import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, isAddressEqual, zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { parseName } from "../../../internal/name/normalize.js";
import { requireV1Contracts } from "../../../internal/name/write.js";
import * as Rpc from "../../../internal/rpc/index.js";
import * as Fuse from "../../../utils/Fuse.js";
import type { getFuses as Promises } from "./index.js";

/** @internal Implementation of `Actions.wrapper.getFuses`. */
export const getFuses = Effect.fn("ensforge.wrapper.getFuses")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const parts = yield* parseName(options.name);
  const contracts = yield* requireV1Contracts(client);

  // `getData` already clears the fuses of expired names, and the owner of expired emancipated ones.
  const [owner, fuses, expiry] = yield* Rpc.readContract(client, {
    address: contracts.nameWrapper,
    abi: Abis.v1.nameWrapper,
    functionName: "getData",
    args: [hexToBigInt(parts.node)],
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  });
  if (isAddressEqual(owner, zeroAddress)) return null;

  return { owner, fuses, burned: Fuse.decode(fuses), expiry };
}, Action.withContext("wrapper.getFuses"));
