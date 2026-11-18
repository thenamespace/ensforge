import { Arbitrary, Array as Arr, Schema, String as Str } from "effect";

import type { Plan } from "@ensforge/sdk/internal/plan/Plan";
import { Arbitraries } from "@ensforge/test-harness";
import { getAddress, pad, toHex, type Address, type Hex } from "viem";

// Built from non-negative integers: plan fields only need distinct, valid values.
const address = Arbitrary.map(Arbitraries.uint(2 ** 31), (value): Address =>
  getAddress(pad(toHex(value), { size: 20 })),
);

const hex = Arbitrary.map(
  Arbitrary.array(Arbitraries.uint(255), { maxLength: 40 }),
  (bytes): Hex =>
    `0x${Arr.join(
      Arr.map(bytes, (byte) => Str.padStart(2, "0")(byte.toString(16))),
      "",
    )}`,
);

const bigint = Arbitrary.schema(Schema.BigInt);
const text = Arbitrary.schema(Schema.String);

const call = Arbitrary.all({ to: address, data: hex, value: bigint });

const step = Arbitrary.flatMap(
  Arbitrary.schema(Schema.Literals(["plain", "wait", "signer"])),
  (kind) =>
    Arbitrary.map(
      Arbitrary.all({
        id: Arbitraries.asciiLabel,
        description: text,
        calls: Arbitrary.array(call, { maxLength: 3 }),
        seconds: bigint,
      }),
      ({ seconds, ...fields }): Plan.Step =>
        kind === "wait"
          ? { ...fields, waitFor: { seconds } }
          : kind === "signer"
            ? { ...fields, from: "signer" }
            : fields,
    ),
);

const requirement = Arbitrary.flatMap(Arbitrary.schema(Schema.Boolean), (isApproval) =>
  isApproval
    ? Arbitrary.map(
        Arbitrary.all({ token: address, spender: address, amount: bigint }),
        (fields): Plan.Requirement => ({ kind: "approval", ...fields }),
      )
    : Arbitrary.map(bigint, (amount): Plan.Requirement => ({ kind: "balance", amount })),
);

/** Plans with nested steps, bigints and hex calldata. `account` is always set. */
export const plan = Arbitrary.map(
  Arbitrary.all({
    id: text,
    operation: text,
    chainId: Arbitraries.uint(2 ** 31),
    account: address,
    steps: Arbitrary.array(step, { maxLength: 3 }),
    requirements: Arbitrary.array(requirement, { maxLength: 2 }),
    warnings: Arbitrary.array(Arbitrary.all({ code: text, message: text }), { maxLength: 2 }),
    deploys: Arbitrary.array(
      Arbitrary.map(address, (deployed): Plan.Deployment => ({
        contract: "resolver",
        address: deployed,
      })),
      { maxLength: 1 },
    ),
  }),
  (fields): Plan => ({
    ...fields,
    calls: Arr.flatMap(fields.steps, (planStep) => planStep.calls),
  }),
);
