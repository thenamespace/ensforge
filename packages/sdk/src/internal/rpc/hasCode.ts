import { Effect } from "effect";

import type { Address } from "viem";
import { getCode } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { fromPromise } from "./fromPromise.js";

/** Whether a contract is deployed at `address` (a counterfactual address has no code yet). */
export const hasCode = (client: Client, address: Address): Effect.Effect<boolean, AnyError> =>
  fromPromise(() => getCode(client.publicClient, { address })).pipe(
    Effect.map((code) => code !== undefined && code !== "0x"),
  );
