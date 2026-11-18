import { assert, describe } from "@effect/vitest";
import { Effect, Record as Rec } from "effect";

import { Actions } from "@ensforge/sdk/effect";

import { Live, onLive } from "../support/live.ts";

describe("indexers", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onLive(network)(network, (it) => {
      it.effect("index within the last hour of blocks", () =>
        Effect.gen(function* () {
          const live = yield* Live;
          const head = yield* live.blockNumber;

          for (const client of [live.withBigname, live.withGoldsky]) {
            if (client === undefined) continue;
            const status = yield* Actions.indexer.getStatus(client);
            const indexed = Rec.values(status.chains)[0]?.indexed;
            if (indexed === undefined || indexed === null) {
              assert.fail(`${status.indexer} reports no indexed block`);
            }
            assert.isBelow(Number(head - indexed), 300, status.indexer);
          }
        }),
      );
    });
  }

  onLive("mainnet")("mainnet", (it) => {
    // nick.eth is an ENSv2 name on mainnet. For unmigrated ENSv1 names bigname reports the ENSv2
    // reservation's expiry, not the registrar's (a documented difference), so they cannot agree.
    it.effect("agree with the chain on an ENSv2 canary name", () =>
      Effect.gen(function* () {
        const live = yield* Live;
        const name = "nick.eth";
        const chainState = yield* Actions.name.get(live.reader, { name });

        for (const client of [live.withBigname, live.withGoldsky]) {
          if (client === undefined) continue;
          const indexed = yield* Actions.indexer.getName(client, { name });
          assert.strictEqual(indexed?.expiresAt ?? null, chainState.expiry, indexed?.indexer);
          assert.strictEqual(indexed?.owner ?? null, chainState.owner, indexed?.indexer);
        }
      }),
    );
  });
});
