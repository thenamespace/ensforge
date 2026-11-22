import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { defineIndexer } from "@ensforge/sdk/internal/indexer/define";
import { recordsToCopy } from "@ensforge/sdk/internal/internal/migration/records";
import { expectFailure } from "@ensforge/test-harness";

import { clientWith } from "../indexer/client.js";

/** An indexer that lists `keys` for every name, and `unsupportedKeys` it cannot read. */
const indexerListing = (keys: readonly string[], unsupportedKeys: readonly string[] = []) =>
  defineIndexer({
    id: "records",
    getRecords: () =>
      Promise.resolve({
        namespace: "ens",
        resolver: null,
        texts: {},
        addresses: {},
        contentHash: null,
        answers: {},
        inventory: { keys, unsetKeys: [], unsupportedKeys },
      }),
  });

describe("recordsToCopy", () => {
  // ABI, interface, data and name records are copied; only the public key has no ENSv2 home.
  it.effect("refuses to leave records behind, naming the ones it cannot copy", () =>
    Effect.gen(function* () {
      const ens = clientWith(
        indexerListing(["abi:1", "interface:0x01ffc9a7", "data:avatar", "name", "pubkey"]),
      );

      const error = yield* expectFailure(
        recordsToCopy(ens, undefined, "alice.eth", { hasRecords: true, allowIncomplete: false }),
        { _tag: "MigrationError", code: "RECORDS_UNKNOWN" },
      );
      assert.include(error.shortMessage, "its pubkey records cannot be copied");
    }),
  );

  it.effect("refuses an inventory the indexer could not complete", () =>
    Effect.gen(function* () {
      const ens = clientWith(indexerListing([], ["text:secret"]));

      const error = yield* expectFailure(
        recordsToCopy(ens, undefined, "alice.eth", { hasRecords: true, allowIncomplete: false }),
        { _tag: "MigrationError", code: "RECORDS_UNKNOWN" },
      );
      assert.include(error.shortMessage, "the indexer could not list every record");
    }),
  );
});
