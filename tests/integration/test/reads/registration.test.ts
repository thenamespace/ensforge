import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { keccak256, toHex } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("registration reads", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("reports the deployment's registrar, renewer and windows", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { reader } = yield* Clients;

        const parameters = yield* Actions.registration.getParameters(reader);

        assert.deepInclude(parameters, {
          registrar: devnet.contract("v2.ethRegistrar"),
          renewer: devnet.contract("v2.ethRenewerV1"),
          minCommitmentAge: 60n,
          maxCommitmentAge: Duration.days(1),
          minDuration: Duration.days(28),
          gracePeriod: Duration.days(28),
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
          const { reader } = yield* Clients;
          const names = [
            ...new Set(
              fixtures.all
                .map((fixture) => fixture.name)
                .filter((name) => /^[^.]+\.eth$/u.test(name)),
            ),
          ];

          const disagreements = yield* Effect.forEach(names, (name) =>
            Effect.all([
              Actions.registration.isAvailable(reader, { name }),
              Actions.name.get(reader, { name }),
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
          const { reader } = yield* Clients;
          const price = (name: string) =>
            Actions.registration.getPrice(reader, { name, duration: Duration.years(1) });

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
          // Length is counted in code points, not bytes: three CJK code points are nine bytes.
          assert.strictEqual((yield* price("你好吗.eth")).base, three.base);
          // 255 bytes is the longest label the oracle prices.
          yield* price(`${"q".repeat(255)}.eth`);

          assert.isFalse(yield* Actions.registration.isAvailable(reader, { name: "qq.eth" }));
          for (const name of ["qq.eth", "たこ.eth", `${"q".repeat(256)}.eth`]) {
            yield* expectFailure(price(name), { _tag: "InvalidInputError", code: "INVALID_NAME" });
          }
        }),
      { meta: { cases: ["M:C9", "G01", "G02", "G03", "G04"] } },
    );

    it.effect(
      "quotes the premium curve of a released name at a given time",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const released = fixtures.byId("registration.v2-premium");
          const graceEnd = BigInt(String(released.facts["expiry"])) + Duration.days(28);
          const priceAt = (at: bigint) =>
            Actions.registration.getPrice(reader, {
              name: released.name,
              duration: Duration.years(1),
              at,
            });

          const [start, nextDay, after] = yield* Effect.all([
            priceAt(graceEnd),
            priceAt(graceEnd + Duration.days(1)),
            priceAt(graceEnd + Duration.days(21)),
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
          const { reader } = yield* Clients;
          const priceIn = (paymentToken: "usdc" | "dai") =>
            Actions.registration.getPrice(reader, {
              name: "qqqqq.eth",
              duration: Duration.years(1),
              paymentToken,
            });
          const [usdc, dai] = yield* Effect.all([priceIn("usdc"), priceIn("dai")]);

          assert.strictEqual(dai.token.symbol, "DAI");
          assert.strictEqual(usdc.base, (dai.base + 10n ** 12n - 1n) / 10n ** 12n);
        }),
      { meta: { cases: ["G27"] } },
    );

    it.effect(
      "refuses a payment token the oracle no longer accepts",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              // A zero ratio removes the token.
              yield* chain.write({
                address: devnet.contract("v2.rentPriceOracle"),
                abi: Abis.v2.standardRentPriceOracle,
                functionName: "updatePaymentToken",
                args: [devnet.contract("v2.dai"), 0n, 0n],
                account: devnet.accounts.owner,
              });

              yield* expectFailure(
                Actions.registration.getPrice(reader, {
                  name: "qqqqq.eth",
                  duration,
                  paymentToken: "dai",
                }),
                { _tag: "UnsupportedError", code: "PAYMENT_TOKEN_UNSUPPORTED" },
              );
              yield* expectFailure(
                Actions.registration.getRenewalPrice(reader, {
                  names: fixtures.byId("v2.registered").name,
                  duration,
                  paymentToken: "dai",
                }),
                { _tag: "UnsupportedError", code: "PAYMENT_TOKEN_UNSUPPORTED" },
              );
            }),
          );
        }),
      { meta: { cases: ["G28"] } },
    );

    it.effect(
      "prices renewals through the contract that renews each name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const renewal = (names: string | readonly string[]) =>
            Actions.registration.getRenewalPrice(reader, { names, duration: Duration.years(1) });
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
          const { reader } = yield* Clients;
          const name = fixtures.byId("v2.registered").name;
          const amountFor = (years: bigint) =>
            Actions.registration
              .getRenewalPrice(reader, { names: name, duration: Duration.years(years) })
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
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const commitment = keccak256(toHex("integration commitment"));
          const commitmentStatus = Actions.registration.getCommitmentStatus(reader, { commitment });

          assert.strictEqual((yield* commitmentStatus).status, "unknown");

          // Committed in a reverted block, so the shared devnet keeps no commitment.
          const statuses = yield* chain.atTimestamp(
            (yield* chain.now) + 1n,
            Effect.gen(function* () {
              yield* chain.write({
                address: devnet.contract("v2.ethRegistrar"),
                abi: Abis.v2.ethRegistrar,
                functionName: "commit",
                args: [commitment],
                account: devnet.accounts.alice,
              });
              const { committedAt } = yield* commitmentStatus;
              if (committedAt === null) return assert.fail("commitment not recorded");

              return yield* Effect.forEach(
                [59n, 60n, Duration.days(1) - 1n, Duration.days(1)],
                (age) =>
                  chain.atTimestamp(
                    committedAt + age,
                    Effect.map(commitmentStatus, (current) => current.status),
                  ),
              );
            }),
          );
          assert.deepStrictEqual(statuses, ["pending", "ready", "ready", "expired"]);
        }),
      { meta: { cases: ["G06"] } },
    );
  });

  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "fails with a typed error where ENSv2 is not deployed",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          yield* expectFailure(Actions.registration.isAvailable(reader, { name: "v1-plain.eth" }), {
            _tag: "UnsupportedError",
            code: "UNSUPPORTED_ON_DEPLOYMENT",
          });
        }),
      { meta: { cases: ["M:F8"] } },
    );
  });
});
