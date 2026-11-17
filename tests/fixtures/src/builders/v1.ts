import { Effect } from "effect";

import type { StepContext } from "@ensforge/test-devnet";
import { labelhash, namehash, zeroAddress, zeroHash, type Address } from "viem";

import { dnsEncode, labelId, secretFor } from "./names.ts";

/** Seconds a commitment must age before registering (both v1 and v2 controllers). */
const commitmentAge = 61n;

export type V1Registration = {
  readonly label: string;
  readonly owner: Address;
  readonly duration: bigint;
  /** Default: the current PublicResolver. */
  readonly resolver?: Address;
  /**
   * `current` (unwrapped, v1.7.0), `wrapped` (2023 NameWrapper controller, with owner fuses) or
   * `legacy` (2020, unwrapped; sets the ETH address as temporary owner).
   */
  readonly controller?: "current" | "wrapped" | "legacy";
  readonly fuses?: number;
  /** Current controller only: 1 sets the registrant's `addr.reverse`, 2 its `default.reverse`. */
  readonly reverseRecord?: number;
};

/**
 * Registers `label.eth` on ENSv1 through a real controller: commit, wait out the commitment age
 * on the build clock, register paying the quoted price. Returns the registrar expiry.
 */
export const registerV1 = Effect.fnUntraced(function* (c: StepContext, options: V1Registration) {
  const { label, owner, duration } = options;
  const name = `${label}.eth`;
  const secret = secretFor(name);
  const resolver = options.resolver ?? (yield* c.address("v1.publicResolver"));
  const from = { from: owner } as const;

  switch (options.controller ?? "current") {
    case "current": {
      const registration = {
        label,
        owner,
        duration,
        secret,
        resolver,
        data: [],
        reverseRecord: options.reverseRecord ?? 0,
        referrer: zeroHash,
      };
      const commitment = yield* c.read<`0x${string}`>(
        "v1.ethRegistrarController",
        "makeCommitment",
        [registration],
      );
      yield* c.write("v1.ethRegistrarController", "commit", [commitment], from);
      c.time.advance(commitmentAge);
      const price = yield* c.read<{ base: bigint; premium: bigint }>(
        "v1.ethRegistrarController",
        "rentPrice",
        [label, duration],
      );
      yield* c.write("v1.ethRegistrarController", "register", [registration], {
        ...from,
        value: price.base + price.premium,
      });
      break;
    }
    case "wrapped": {
      const args = [label, owner, duration, secret, resolver, [], false, options.fuses ?? 0];
      const commitment = yield* c.read<`0x${string}`>(
        "v1.wrappedEthRegistrarController",
        "makeCommitment",
        args,
      );
      yield* c.write("v1.wrappedEthRegistrarController", "commit", [commitment], from);
      c.time.advance(commitmentAge);
      const price = yield* c.read<{ base: bigint; premium: bigint }>(
        "v1.wrappedEthRegistrarController",
        "rentPrice",
        [label, duration],
      );
      yield* c.write("v1.wrappedEthRegistrarController", "register", args, {
        ...from,
        value: price.base + price.premium,
      });
      break;
    }
    case "legacy": {
      const commitment = yield* c.read<`0x${string}`>(
        "v1.legacyEthRegistrarController",
        "makeCommitmentWithConfig",
        [label, owner, secret, resolver, owner],
      );
      yield* c.write("v1.legacyEthRegistrarController", "commit", [commitment], from);
      c.time.advance(commitmentAge);
      // The 2020 controller reads only the first word of today's (base, premium) price.
      const price = yield* c.read<bigint>("v1.legacyEthRegistrarController", "rentPrice", [
        label,
        duration,
      ]);
      yield* c.write(
        "v1.legacyEthRegistrarController",
        "registerWithConfig",
        [label, owner, duration, secret, resolver, owner],
        { ...from, value: price * 2n },
      );
      break;
    }
  }

  const expiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [labelId(label)]);
  return { name, node: namehash(name), resolver, expiry };
});

/** An unwrapped registry subname, created by the parent's registry owner. */
export const v1Subname = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly parent: string;
    readonly label: string;
    readonly parentOwner: Address;
    readonly owner: Address;
    readonly resolver?: Address;
  },
) {
  const resolver = options.resolver ?? (yield* c.address("v1.publicResolver"));
  yield* c.write(
    "v1.registry",
    "setSubnodeRecord",
    [namehash(options.parent), labelhash(options.label), options.owner, resolver, 0n],
    { from: options.parentOwner },
  );
  const name = `${options.label}.${options.parent}`;
  return { name, node: namehash(name), resolver };
});

/** A wrapped subname, created through the NameWrapper by the wrapped parent's owner. */
export const wrappedSubname = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly parent: string;
    readonly label: string;
    readonly parentOwner: Address;
    readonly owner: Address;
    readonly fuses: number;
    readonly expiry: bigint;
    readonly resolver?: Address;
  },
) {
  const resolver = options.resolver ?? (yield* c.address("v1.publicResolver"));
  yield* c.write(
    "v1.nameWrapper",
    "setSubnodeRecord",
    [
      namehash(options.parent),
      options.label,
      options.owner,
      resolver,
      0n,
      options.fuses,
      options.expiry,
    ],
    { from: options.parentOwner },
  );
  const name = `${options.label}.${options.parent}`;
  return { name, node: namehash(name), resolver };
});

/** Wraps an unwrapped `.eth` 2LD its registrant holds. */
export const wrapEth2ld = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly label: string; readonly registrant: Address; readonly fuses?: number },
) {
  const from = { from: options.registrant } as const;
  yield* c.write(
    "v1.baseRegistrar",
    "setApprovalForAll",
    [yield* c.address("v1.nameWrapper"), true],
    from,
  );
  yield* c.write(
    "v1.nameWrapper",
    "wrapETH2LD",
    [options.label, options.registrant, options.fuses ?? 0, yield* c.address("v1.publicResolver")],
    from,
  );
});

/** Wraps a non-`.eth` name whose registry owner approved the wrapper. */
export const wrapName = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly name: string; readonly owner: Address },
) {
  const from = { from: options.owner } as const;
  yield* c.write(
    "v1.registry",
    "setApprovalForAll",
    [yield* c.address("v1.nameWrapper"), true],
    from,
  );
  yield* c.write(
    "v1.nameWrapper",
    "wrap",
    [dnsEncode(options.name), options.owner, yield* c.address("v1.publicResolver")],
    from,
  );
});

/**
 * A name on the registry ENS replaced in 2020, under the `test` TLD there (the current registry
 * has no `test`, so reads fall back to the old one). `owner` holds the old root.
 */
export const oldRegistryName = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly label: string; readonly owner: Address; readonly resolver: Address },
) {
  const root = { from: c.accounts.owner } as const;
  const testOwner = yield* c.read<Address>("v1.legacyRegistry", "owner", [namehash("test")]);
  if (testOwner === zeroAddress) {
    yield* c.write(
      "v1.legacyRegistry",
      "setSubnodeOwner",
      [zeroHash, labelhash("test"), c.accounts.owner],
      root,
    );
  }
  const name = `${options.label}.test`;
  yield* c.write(
    "v1.legacyRegistry",
    "setSubnodeOwner",
    [namehash("test"), labelhash(options.label), options.owner],
    root,
  );
  yield* c.write("v1.legacyRegistry", "setResolver", [namehash(name), options.resolver], {
    from: options.owner,
  });
  return { name, node: namehash(name) };
});

/**
 * A registry subname created by label hash only, for labels that cannot be written as text
 * (containing `.`, literal `[hex]`, invalid UTF-8, unknown). `name` uses the `[labelhash]` form.
 */
export const hashedSubname = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly parent: string;
    readonly labelhash: `0x${string}`;
    readonly parentOwner: Address;
    readonly owner: Address;
  },
) {
  yield* c.write(
    "v1.registry",
    "setSubnodeOwner",
    [namehash(options.parent), options.labelhash, options.owner],
    { from: options.parentOwner },
  );
  const name = `[${options.labelhash.slice(2)}].${options.parent}`;
  return { name, node: namehash(name) };
});
