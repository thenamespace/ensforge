import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { create } from "@ensforge/sdk/internal/client/create";
import { parseName } from "@ensforge/sdk/internal/internal/name/normalize";
import { parentLabel } from "@ensforge/sdk/internal/internal/registry/deploy";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { hexToBigInt, labelhash } from "viem";
import { mainnet } from "viem/chains";

/** A client whose LabelStore knows `labels`. */
const clientKnowing = (labels: readonly string[]) =>
  create({
    chain: mainnet,
    transports: {
      [mainnet.id]: scriptedTransport(
        contractScript({
          contracts: [
            {
              address: Deployments.mainnet.v2.contracts.labelStore,
              abi: Abis.v2.labelStore,
              functions: {
                getLabel: ([id]) =>
                  Option.getOrElse(
                    Arr.findFirst(labels, (label) => hexToBigInt(labelhash(label)) === id),
                    () => "",
                  ),
              },
            },
          ],
        }),
      ).transport,
    },
    publicRpc: false,
    batch: { multicall: false },
  });

// `setParent` stores the label it is given: an encoded `[…]` label would become the registry's
// canonical name.
describe("parentLabel", () => {
  it.effect("recovers a label known only by its hash from the LabelStore", () =>
    Effect.gen(function* () {
      const parts = yield* parseName(`${Name.fromLabelhash(labelhash("alice"))}.eth`);

      const result = yield* parentLabel(clientKnowing(["alice"]), parts);

      assert.deepStrictEqual(result, { label: "alice", warnings: [] });
    }),
  );

  it.effect("leaves setParent out, with a warning, when the LabelStore lacks it", () =>
    Effect.gen(function* () {
      const parts = yield* parseName(`${Name.fromLabelhash(labelhash("alice"))}.eth`);

      const result = yield* parentLabel(clientKnowing([]), parts);

      assert.isUndefined(result.label);
      assert.deepStrictEqual(
        Arr.map(result.warnings, (warning) => warning.code),
        ["REGISTRY_PARENT_UNSET"],
      );
    }),
  );
});
