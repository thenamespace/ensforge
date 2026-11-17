import { Roles } from "@ensforge/contracts";
import { bytesToHex, concatHex, labelhash, numberToHex, type Hex } from "viem";
import { packetToBytes } from "viem/ens";

const { registry: role } = Roles;

export const secondsPerDay = 86_400n;
export const secondsPerYear = 365n * secondsPerDay;

/**
 * Root role bitmaps the contracts-v2 deploy scripts grant (`script/deploy-constants.ts`), as the
 * mainnet constructor arguments show them: without the `upgrade` roles v1.0.1's scripts add, which
 * mainnet's registry build counts as unemancipated (safe transfers would revert). The `.eth`
 * registry's deployer holds only the admin of `registrar` and `renew`, so it can grant them but
 * not register itself.
 */
export const deploymentRoles = (() => {
  const safeRootRoles =
    role.registrar |
    role.registrarAdmin |
    role.registerReserved |
    role.registerReservedAdmin |
    role.setParent |
    role.setParentAdmin |
    role.renew |
    role.renewAdmin |
    role.canName |
    role.canNameAdmin |
    role.setUri |
    role.setUriAdmin;
  return {
    rootRegistryRoot: safeRootRoles,
    registryOwnerRoot: safeRootRoles,
    rootNameToken: Roles.enhancedAccessControl.allRoles,
    ethRegistryRoot:
      role.registrarAdmin |
      role.registerReservedAdmin |
      role.setParent |
      role.setParentAdmin |
      role.renewAdmin |
      role.canName |
      role.canNameAdmin |
      role.setUri |
      role.setUriAdmin,
    registryManager: role.canName | role.setUri,
    ethRegistrar: role.registrar | role.renew,
    ethRenewerV1: role.renew,
    migrationController: role.registerReserved,
    temporaryDnsRegistrar: role.registrar | role.registerReserved,
    batchRegistrar: role.registrar | role.renew,
  } as const;
})();

/** Rent pricing as deployed on mainnet (`StandardRentPriceOracle` constructor arguments). */
export const rentPricing = (() => {
  const priceScale = 10n ** 12n;
  const discountDenominator = 10n ** 38n;
  const discount = (numer: bigint, denom: bigint) => (discountDenominator * numer) / denom;
  return {
    baseRatePerCodePoint: [0n, 0n, 640n, 160n, 8n].map(
      (yearly) => (yearly * priceScale + secondsPerYear - 1n) / secondsPerYear,
    ),
    discountPoints: [
      { duration: secondsPerYear * 2n, numer: discount(7n, 8n) },
      { duration: secondsPerYear * 3n, numer: discount(11n, 16n) },
      { duration: secondsPerYear * 6n, numer: discount(9n, 16n) },
    ],
    discountDenominator,
    premiumPriceInitial: priceScale * 100_000_000n,
    premiumHalvingPeriod: secondsPerDay,
    premiumPeriod: 21n * secondsPerDay,
    /** Payment ratio of a token with `decimals` against the oracle's 12-decimal prices. */
    paymentRatio: (decimals: number) => ({
      numer: 10n ** BigInt(Math.max(decimals - 12, 0)),
      denom: 10n ** BigInt(Math.max(12 - decimals, 0)),
    }),
  };
})();

/** ENSv1 `.eth` registration and ENSv2 grace periods. */
export const gracePeriodV1 = 90n * secondsPerDay;
export const gracePeriodV2 = 28n * secondsPerDay;
export const premigrationBonusPeriod = 1n + (gracePeriodV1 - gracePeriodV2);

/** Interface IDs registered on the `.eth` resolver, as on mainnet. */
export const ethResolverInterfaces = {
  nameWrapper: "0x019a38fe",
  wrappedEthRegistrarController: "0x612e8c09",
  ethRegistrarController: "0xe4f37f79",
  legacyEthRegistrarController: "0x018fac06",
} as const;

/** DNS top-level domains the devnet treats as public suffixes, as contracts-v2's local devnet. */
export const dnsTlds = ["com", "org", "net", "xyz"] as const;

/** A name in DNS wire format. */
export const dnsEncode = (name: string): Hex => bytesToHex(packetToBytes(name));

// A root DS record: `.` IN DS with a 3600 s TTL.
const rootDs = (keyTag: number, algorithm: number, digestType: number, digest: Hex): Hex => {
  const rdata = concatHex([
    numberToHex(keyTag, { size: 2 }),
    numberToHex(algorithm, { size: 1 }),
    numberToHex(digestType, { size: 1 }),
    digest,
  ]);
  return concatHex([
    "0x00002b0001",
    numberToHex(3600, { size: 4 }),
    numberToHex((rdata.length - 2) / 2, { size: 2 }),
    rdata,
  ]);
};

/**
 * DNSSEC trust anchors: the two root KSKs (as on mainnet) and ens-contracts' test anchor, which
 * `DummyAlgorithm` (253/254) and `DummyDigest` (253) accept, so tests can sign their own proofs.
 */
export const dnssecAnchors = concatHex([
  rootDs(19036, 8, 2, "0x49aac11d7b6f6446702e54a1607371607a1a41855200fd2ce1cdde32f24e8fb5"),
  rootDs(20326, 8, 2, "0xe06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d"),
  rootDs(1278, 253, 253, "0x"),
]);

export const ethLabelhash = labelhash("eth");
