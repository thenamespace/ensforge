import { Effect } from "effect";

import type { PreparedWriteCall, SimulatedWriteCall } from "../../write/types.js";
import { WriteClient } from "./write-client.js";

export const simulatePreparedCalls = Effect.fn("simulatePreparedCalls")(function* (
  calls: ReadonlyArray<PreparedWriteCall>,
  concurrency: number,
) {
  const client = yield* WriteClient;

  return yield* Effect.forEach(
    calls,
    (call) =>
      client.simulate(call).pipe(
        Effect.map((result): SimulatedWriteCall => ({
          call,
          result: result.data,
        })),
      ),
    { concurrency },
  );
});
