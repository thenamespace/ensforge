import { Effect, Array as Arr } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import { knownContracts } from "../../../internal/event/classify.js";
import { decodeLogs } from "../../../internal/event/decode.js";
import type { decode as Promises } from "./index.js";

/** @internal Implementation of `Actions.event.decode`. Pure: no RPC calls. */
export const decode = (
  client: Client,
  options: Promises.Options,
): Effect.Effect<Promises.ReturnType, AnyError> =>
  Effect.sync(() =>
    decodeLogs(knownContracts(client), [
      ...(options.logs ?? []),
      ...Arr.flatMap(options.receipts ?? [], (receipt) => receipt.logs),
    ]),
  );
