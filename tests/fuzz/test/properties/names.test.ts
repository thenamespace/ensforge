import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Arbitraries } from "@ensforge/test-harness";
import { onProfile } from "@ensforge/test-integration/support/lane";

import { holds } from "./check.ts";

describe("names against the Universal Resolver", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    // The Universal Resolver decodes the DNS-encoded name with NameCoder and namehashes it on chain.
    it.effect("Name.dnsEncode and Name.namehash agree with NameCoder", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const label = Arbitrary.flatMap(Arbitrary.schema(Schema.Boolean), (ascii) =>
          ascii ? Arbitraries.asciiLabel : Arbitraries.unicodeLabel,
        );
        const names = Arbitrary.map(
          Arbitrary.array(label, { minLength: 1, maxLength: 4 }),
          (labels) => Arr.join(labels, "."),
        );

        yield* holds(names, (name) =>
          chain
            .read({
              address: devnet.contract("v2.universalResolver"),
              abi: Abis.shared.universalResolverFindResolver,
              functionName: "findResolver",
              args: [Name.dnsEncode(name)],
            })
            .pipe(Effect.map(([, node]) => node === Name.namehash(name))),
        );
      }),
    );
  });
});
