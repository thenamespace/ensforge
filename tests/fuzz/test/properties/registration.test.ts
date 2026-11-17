import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Arbitraries } from "@ensforge/test-harness";
import { Clients } from "@ensforge/test-integration/support/clients";
import { onProfile } from "@ensforge/test-integration/support/lane";
import { decodeFunctionData, type Abi, type Address, type Hex } from "viem";

import { holds } from "./check.ts";

describe("registration plans against the contracts", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    // The commitment covers a resolver that does not exist yet: its CREATE2 address must be the
    // one VerifiableFactory will deploy to, and the commitment the one ETHRegistrar recomputes.
    it.effect(
      "commitments and resolver addresses agree with ETHRegistrar and VerifiableFactory",
      () =>
        Effect.gen(function* () {
          const signer = (yield* Devnet).accounts.alice;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: signer });
          // Every contract a registration plan calls, to decode its calls.
          const abi = [
            ...Abis.v2.ethRegistrar,
            ...Abis.v2.verifiableFactory,
            ...Abis.shared.erc20,
          ] as Abi;
          const registrations = Arbitrary.all({
            // Labels short enough to be refused are not the point here.
            label: Arbitrary.map(Arbitraries.asciiLabel, (label) => `reg${label}`),
            owner: Arbitraries.address,
            secret: Arbitraries.bytes32,
            referrer: Arbitraries.bytes32,
            years: Arbitrary.schema(Schema.Literals([1, 2, 3])),
          });

          yield* holds(registrations, (input) =>
            Effect.gen(function* () {
              const plan = yield* Actions.registration.register.prepare(ens, {
                names: `${input.label}.eth`,
                duration: Duration.years(input.years),
                owner: input.owner,
                secret: input.secret,
                referrer: input.referrer,
              });
              const calls = plan.steps
                .flatMap((step) => step.calls)
                .map((call) => ({
                  to: call.to,
                  decoded: decodeFunctionData({ abi, data: call.data }),
                }));
              const find = (functionName: string) =>
                calls.find((call) => call.decoded.functionName === functionName);
              const commit = find("commit");
              const deploy = find("deployProxy");
              const register = find("register");
              if (commit === undefined || deploy === undefined || register === undefined)
                return false;

              const [, salt] = deploy.decoded.args as readonly [Address, bigint, Hex];
              const [label, owner, secret, subregistry, resolver, duration, , referrer] = register
                .decoded.args as readonly [
                string,
                Address,
                Hex,
                Address,
                Address,
                bigint,
                Address,
                Hex,
              ];
              const predicted = yield* chain.read({
                address: deploy.to,
                abi: Abis.v2.verifiableFactory,
                functionName: "predictProxyAddress",
                args: [signer, salt],
              });
              const commitment = yield* chain.read({
                address: register.to,
                abi: Abis.v2.ethRegistrar,
                functionName: "makeCommitment",
                args: [label, owner, secret, subregistry, resolver, duration, referrer],
              });
              return predicted === resolver && commitment === commit.decoded.args?.[0];
            }),
          );
        }),
    );
  });
});
