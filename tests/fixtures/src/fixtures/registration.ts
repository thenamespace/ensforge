import { Effect } from "effect";

import { maxUint256, zeroAddress, zeroHash } from "viem";

import { expectState } from "../builders/check.ts";
import { labelId } from "../builders/names.ts";
import { registerV1 } from "../builders/v1.ts";
import { fundUsdc, registerV2 } from "../builders/v2.ts";
import type { Fixture } from "../fixture.ts";
import { days, durations } from "./durations.ts";

const year = days(365n);

/** Price tiers by code point, a v2 premium, and renewals in grace through both renewers. */
export const registration: readonly Fixture[] = [
  ...(
    [
      ["registration.price.3cp", "fx3", ["M:C9", "G03"]],
      ["registration.price.4cp", "four", ["M:C9"]],
      ["registration.price.5cp", "fiver", ["M:C9"]],
      // Three code points, one grapheme: priced as a three-character name.
      ["registration.price.emoji-zwj", "🍄‍🟫", ["M:C9", "G01"]],
    ] as const
  ).map(([id, label, cases]): Fixture => ({
    id,
    cases,
    tags: { kind: "v2-native", state: "registered", price: `${[...label].length}cp` },
    v2: true,
    postlaunch: (c) =>
      registerV2(c, { label, owner: c.accounts.alice, duration: durations.active }).pipe(
        Effect.map((name) => ({ ...name, codePoints: [...label].length })),
      ),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v2.ethRegistry", "findOwner", [label]);
        yield* expectState(id, "owner", owner, c.accounts.alice);
        yield* expectState(id, "name", facts["name"], `${label}.eth`);
      }),
  })),
  {
    id: "registration.v2-premium",
    cases: ["G14"],
    tags: { kind: "v2-native", state: "premium" },
    v2: true,
    postlaunch: (c) =>
      registerV2(c, {
        label: "v2-premium",
        owner: c.accounts.alice,
        duration: durations.v2Premium,
      }),
    check: (c) =>
      Effect.gen(function* () {
        const [, premium] = yield* c.read<readonly [bigint, bigint]>(
          "v2.ethRegistrar",
          "getRegisterPrice",
          ["v2-premium", year, yield* c.address("v2.usdc")],
        );
        yield* expectState("registration.v2-premium", "premium > 0", premium > 0n, true);
      }),
  },
  {
    id: "registration.v2-renewed-in-grace",
    cases: ["T09", "G11"],
    tags: { kind: "v2-native", state: "renewed-in-grace" },
    v2: true,
    // Renewed during grace: the new expiry counts from the old one, not from now.
    postlaunch: (c) =>
      registerV2(c, {
        label: "v2-late-renewal",
        owner: c.accounts.alice,
        duration: durations.v2Grace,
      }).pipe(Effect.map((name) => ({ name: name.name, firstExpiry: name.expiry }))),
    afterTime: (c) =>
      Effect.gen(function* () {
        yield* fundUsdc(c, c.accounts.alice);
        yield* c.write(
          "v2.ethRegistrar",
          "renew",
          [
            { label: "v2-late-renewal", duration: year, referrer: zeroHash },
            yield* c.address("v2.usdc"),
          ],
          { from: c.accounts.alice },
        );
        return { renewedBy: year };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const expiry = yield* c.read<bigint>("v2.ethRegistry", "findExpiry", ["v2-late-renewal"]);
        yield* expectState(
          "registration.v2-renewed-in-grace",
          "expiry",
          expiry,
          BigInt(String(facts["firstExpiry"])) + year,
        );
      }),
  },
  {
    id: "registration.v1-renewed-by-renewer",
    cases: ["G12", "G13", "M:A5"],
    tags: { kind: "v1-unwrapped", state: "renewed-after-launch" },
    v2: true,
    launched: true,
    // An unmigrated ENSv1 name in grace after the launch, renewed through ETHRenewerV1, which
    // renews only names ENSv2 reserved for them (premigration).
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1(c, {
          label: "v1-renewed",
          owner: c.accounts.alice,
          duration: durations.v1Grace,
        });
        yield* c.write("v2.batchRegistrar", "batchRegister", [
          zeroAddress,
          yield* c.address("v2.ensV1Resolver"),
          ["v1-renewed"],
          [name.expiry + 1n + days(62n)],
        ]);
        return { name: name.name, firstExpiry: name.expiry };
      }),
    afterTime: (c) =>
      Effect.gen(function* () {
        const renewer = yield* c.address("v2.ethRenewerV1");
        const usdc = yield* c.address("v2.usdc");
        yield* fundUsdc(c, c.accounts.alice);
        yield* c.write([usdc, "v2/MockERC20"], "approve", [renewer, maxUint256], {
          from: c.accounts.alice,
        });
        yield* c.write(
          "v2.ethRenewerV1",
          "renew",
          [{ label: "v1-renewed", duration: year, referrer: zeroHash }, usdc],
          { from: c.accounts.alice },
        );
        return { renewedBy: year };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const expiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [
          labelId("v1-renewed"),
        ]);
        yield* expectState(
          "registration.v1-renewed-by-renewer",
          "expiry",
          expiry,
          BigInt(String(facts["firstExpiry"])) + year,
        );
      }),
  },
];
