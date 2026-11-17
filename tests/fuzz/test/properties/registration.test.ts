import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";

import { Abis } from "@ensforge/contracts";
import { Devnet } from "@ensforge/test-devnet";
import { Arbitraries } from "@ensforge/test-harness";
import { ensforge, onProfile } from "@ensforge/test-integration/support/chain";
import { decodeFunctionData, type Abi, type Address, type Hex } from "viem";

import { holds } from "./check.ts";

const year = 31_536_000n;

const registrations = Arbitrary.all({
  // Labels short enough to be refused are not the point here.
  label: Arbitrary.map(Arbitraries.asciiLabel, (label) => `reg${label}`),
  owner: Arbitraries.address,
  secret: Arbitraries.bytes32,
  referrer: Arbitraries.bytes32,
  years: Arbitrary.schema(Schema.Literals([1n, 2n, 3n])),
});

const abi = [...Abis.v2.ethRegistrar, ...Abis.v2.verifiableFactory, ...Abis.shared.erc20] as Abi;

describe("registration plans against the contracts", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    // The commitment covers a resolver that does not exist yet: its CREATE2 address must be the
    // one VerifiableFactory will deploy to, and the commitment the one ETHRegistrar recomputes.
    it.effect(
      "commitments and resolver addresses agree with ETHRegistrar and VerifiableFactory",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const signer = devnet.accounts.alice;
          const ens = ensforge(devnet, { account: signer });
          const read = (address: Address, functionName: string, args: readonly unknown[]) =>
            Effect.promise(
              () =>
                devnet.client.readContract({
                  address,
                  abi,
                  functionName,
                  args,
                } as never) as Promise<unknown>,
            );

          yield* holds(registrations, (input) =>
            Effect.gen(function* () {
              const plan = yield* Effect.promise(() =>
                ens.registration.register.prepare({
                  names: `${input.label}.eth`,
                  duration: input.years * year,
                  owner: input.owner,
                  secret: input.secret,
                  referrer: input.referrer,
                }),
              );
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
              const predicted = yield* read(deploy.to, "predictProxyAddress", [signer, salt]);
              const commitment = yield* read(register.to, "makeCommitment", [
                label,
                owner,
                secret,
                subregistry,
                resolver,
                duration,
                referrer,
              ]);
              return predicted === resolver && commitment === commit.decoded.args?.[0];
            }),
          );
        }),
    );
  });
});
