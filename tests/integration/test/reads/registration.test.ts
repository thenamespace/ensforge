import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { keccak256, toHex, type Address } from "viem";

import { atTimestamp, ensforge, onProfile } from "../support/chain.ts";

const day = 86_400n;
const year = 365n * day;

describe("registration reads", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("reports the deployment's registrar, renewer and windows", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const parameters = yield* Actions.registration.getParameters(ensforge(devnet));

        assert.deepInclude(parameters, {
          registrar: devnet.contracts["v2.ethRegistrar"] as Address,
          renewer: devnet.contracts["v2.ethRenewerV1"] as Address,
          minCommitmentAge: 60n,
          maxCommitmentAge: day,
          minDuration: 28n * day,
          gracePeriod: 28n * day,
        });
        assert.sameMembers(
          parameters.paymentTokens.map((token) => `${token.symbol}/${token.decimals}`),
          ["DAI/18", "USDC/6"],
        );
      }),
    );

    // Names ENSv1 or ENSv2 hold, past or present: the registrar is the authority after the launch.
    it.effect(
      "isAvailable agrees with name.get for every .eth second-level name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const names = [
            ...new Set(
              fixtures.all
                .map((fixture) => fixture.name)
                .filter((name) => /^[^.]+\.eth$/u.test(name)),
            ),
          ];

          const disagreements = yield* Effect.forEach(names, (name) =>
            Effect.all([
              Actions.registration.isAvailable(ens, { name }),
              Actions.name.get(ens, { name }),
            ]).pipe(
              Effect.map(([available, state]) =>
                available === state.available ? [] : [`${name}: ${available}`],
              ),
            ),
          );
          assert.deepStrictEqual(disagreements.flat(), []);
        }),
      { meta: { cases: ["O19", "M:A19"] } },
    );

    it.effect(
      "prices labels by code point and refuses labels below the minimum",
      () =>
        Effect.gen(function* () {
          const ens = ensforge(yield* Devnet);
          const price = (name: string) =>
            Actions.registration.getPrice(ens, { name, duration: year });

          const [three, four, five, phoenix] = yield* Effect.all([
            price("qqq.eth"),
            price("qqqq.eth"),
            price("qqqqq.eth"),
            price("\u{1F426}\u200D\u{1F525}.eth"),
          ]);
          assert.isTrue(three.base > four.base && four.base > five.base);
          // Three code points, one grapheme.
          assert.strictEqual(phoenix.base, three.base);
          assert.strictEqual(three.premium, 0n);

          assert.isFalse(yield* Actions.registration.isAvailable(ens, { name: "qq.eth" }));
          yield* expectFailure(
            Actions.registration.getPrice(ens, { name: "qq.eth", duration: year }),
            {
              _tag: "InvalidInputError",
              code: "INVALID_NAME",
            },
          );
        }),
      { meta: { cases: ["M:C9", "G01", "G03"] } },
    );

    it.effect(
      "quotes the premium curve of a released name at a given time",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const released = fixtures.byId("registration.v2-premium");
          const graceEnd = BigInt(String(released.facts["expiry"])) + 28n * day;
          const priceAt = (at: bigint) =>
            Actions.registration.getPrice(ens, { name: released.name, duration: year, at });

          const [start, nextDay, after] = yield* Effect.all([
            priceAt(graceEnd),
            priceAt(graceEnd + day),
            priceAt(graceEnd + 21n * day),
          ]);
          assert.isTrue(start.premium > nextDay.premium && nextDay.premium > 0n);
          assert.strictEqual(after.premium, 0n);
          assert.strictEqual(start.total, start.base + start.premium);
        }),
      { meta: { cases: ["G14"] } },
    );

    it.effect(
      "converts prices to each token, rounding up",
      () =>
        Effect.gen(function* () {
          const ens = ensforge(yield* Devnet);
          const priceIn = (paymentToken: "usdc" | "dai") =>
            Actions.registration.getPrice(ens, { name: "qqqqq.eth", duration: year, paymentToken });
          const [usdc, dai] = yield* Effect.all([priceIn("usdc"), priceIn("dai")]);

          assert.strictEqual(dai.token.symbol, "DAI");
          assert.strictEqual(usdc.base, (dai.base + 10n ** 12n - 1n) / 10n ** 12n);
        }),
      { meta: { cases: ["G27"] } },
    );

    it.effect(
      "prices renewals through the contract that renews each name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const renewal = (names: string | readonly string[]) =>
            Actions.registration.getRenewalPrice(ens, { names, duration: year });
          const v2Name = fixtures.byId("v2.registered").name;
          const premigrated = fixtures.byId("v2.reserved").name;

          const both = yield* renewal([v2Name, premigrated]);
          assert.deepStrictEqual(
            both.items.map((item) => [item.name, item.route]),
            [
              [v2Name, "v2-registrar"],
              [premigrated, "v1-renewer"],
            ],
          );
          assert.strictEqual(
            both.total,
            both.items.reduce((sum, item) => sum + item.amount, 0n),
          );

          for (const id of ["v1.unwrapped", "v2.expired"]) {
            yield* expectFailure(renewal(fixtures.byId(id).name), {
              _tag: "NameStateError",
              code: "NAME_NOT_RENEWABLE",
            });
          }
        }),
      { meta: { cases: ["O18", "O19", "G12"] } },
    );

    it.effect(
      "applies the multi-year renewal discounts",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const name = fixtures.byId("v2.registered").name;
          const amountFor = (years: bigint) =>
            Actions.registration
              .getRenewalPrice(ens, { names: name, duration: years * year })
              .pipe(Effect.map((price) => price.total));

          const [one, two, three, six] = yield* Effect.all([
            amountFor(1n),
            amountFor(2n),
            amountFor(3n),
            amountFor(6n),
          ]);
          // 12.5%, 31.25% and 43.75% off, in sixteenths, rounded up.
          const discounted = (years: bigint, sixteenths: bigint) =>
            (one * years * sixteenths + 15n) / 16n;
          assert.deepStrictEqual(
            [two, three, six],
            [discounted(2n, 14n), discounted(3n, 11n), discounted(6n, 9n)],
          );
        }),
      { meta: { cases: ["G26"] } },
    );

    it.effect(
      "tracks a commitment through its window",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const ens = ensforge(devnet);
          const commitment = keccak256(toHex("integration commitment"));
          const status = () => Actions.registration.getCommitmentStatus(ens, { commitment });

          assert.strictEqual((yield* status()).status, "unknown");
          const { latest } = yield* Effect.promise(() =>
            devnet.client.getBlock().then((block) => ({ latest: block.timestamp })),
          );

          // Committed in a reverted block, so the shared devnet keeps no commitment.
          const statuses = yield* atTimestamp(
            devnet,
            latest + 1n,
            Effect.gen(function* () {
              yield* Effect.promise(async () => {
                const hash = await devnet.client.writeContract({
                  address: devnet.contracts["v2.ethRegistrar"] as Address,
                  abi: Abis.v2.ethRegistrar,
                  functionName: "commit",
                  args: [commitment],
                  account: devnet.accounts.alice,
                  chain: devnet.chain,
                });
                await devnet.client.waitForTransactionReceipt({ hash });
              });
              const { committedAt } = yield* status();
              if (committedAt === null) return assert.fail("commitment not recorded");
              return yield* Effect.forEach([59n, 60n, day - 1n, day], (age) =>
                atTimestamp(devnet, committedAt + age, status().pipe(Effect.map((s) => s.status))),
              );
            }),
          );
          assert.deepStrictEqual(statuses, ["pending", "ready", "ready", "expired"]);
        }),
      { meta: { cases: ["G06"] } },
    );
  });

  onProfile("v1-live")("v1-live", (it) => {
    it.effect("fails with a typed error where ENSv2 is not deployed", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        yield* expectFailure(Actions.registration.isAvailable(ens, { name: "v1-plain.eth" }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_ON_DEPLOYMENT",
        });
      }),
    );
  });
});
