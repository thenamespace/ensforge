import { Effect } from "effect";

import type { RpcError } from "../../errors/rpc-error.js";
import { viemErrorToEffectError } from "../errors/viem-error.js";
import { PublicClientService } from "../services/public-client.js";
import { ReadContext } from "./execution-context.js";

export const readBlockTimestamp = Effect.fn("readBlockTimestamp")(function* (): Effect.fn.Return<
  bigint,
  RpcError,
  PublicClientService | ReadContext
> {
  const { client } = yield* PublicClientService;
  const context = yield* ReadContext;

  const block = yield* Effect.tryPromise({
    try: () => client.getBlock(context.block),
    catch: (cause) => viemErrorToEffectError(cause, "getBlock"),
  });

  return block.timestamp;
});
