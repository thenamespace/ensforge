import { Array as Arr, Effect, String as Str, type FileSystem } from "effect";

import { isAddress, isAddressEqual, labelhash, namehash, zeroAddress, zeroHash } from "viem";

import { loadArtifact } from "./artifacts/files.ts";
import { ethResolverInterfaces, deploymentRoles, dnsTlds } from "./deploy/constants.ts";
import { Devnet } from "./Devnet.ts";
import { DeployError, type ArtifactError } from "./errors.ts";
import { profiles } from "./profiles/profiles.ts";

/**
 * Checks the running devnet against what its profile's steps should have produced: code
 * everywhere, ownership and controllers for its stage (before or after the ENSv2 launch),
 * interface registrations, ENSv2 roles and root names. Returns one line per problem.
 */
export const verify = Effect.fn("verify")(function* () {
  const devnet = yield* Devnet;
  const { client, accounts, ledger, contract, profile } = devnet;
  if (profile === "mainnet" || profile === "sepolia") {
    return yield* Effect.die(new Error(`verify checks a built profile, not a fork of ${profile}`));
  }
  const launched = Arr.some(profiles[profile].steps, (step) => Str.startsWith("cutover")(step.id));
  const hasV2 = ledger.has("v2.rootRegistry");
  const problems: string[] = [];

  const read = <A = unknown>(
    key: string,
    functionName: string,
    args: readonly unknown[] = [],
  ): Effect.Effect<A, DeployError | ArtifactError, FileSystem.FileSystem> =>
    Effect.gen(function* () {
      const deployed = ledger.get(key);
      if (deployed === undefined) {
        return yield* DeployError.make({ step: "verify", message: `${key} is not deployed` });
      }
      const { abi } = yield* loadArtifact(deployed.artifact);
      const result = yield* Effect.tryPromise({
        try: () =>
          client.readContract({ address: deployed.address, abi, functionName, args: [...args] }),
        catch: (cause) =>
          DeployError.make({ step: "verify", message: `${key}.${functionName}: ${String(cause)}` }),
      });
      // The caller states the result type; the ABI is only known at runtime.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return result as A;
    });
  const expect = Effect.fnUntraced(function* (
    label: string,
    actual: Effect.Effect<unknown, DeployError | ArtifactError, FileSystem.FileSystem>,
    expected: unknown,
  ) {
    const value = yield* actual;
    // Addresses and other hex values compare in any case.
    const same =
      typeof value === "string" && typeof expected === "string" && Str.startsWith("0x")(value)
        ? isAddress(value, { strict: false }) && isAddress(expected, { strict: false })
          ? isAddressEqual(value, expected)
          : Str.toLowerCase(value) === Str.toLowerCase(expected)
        : value === expected;
    if (!same) problems.push(`${label}: ${String(value)}, expected ${String(expected)}`);
  });

  // Code at every address; placed mainnet code byte for byte.
  for (const [key, deployed] of ledger) {
    const code = yield* Effect.promise(() => client.getCode({ address: deployed.address }));
    const artifact = yield* loadArtifact(deployed.artifact);
    if (code === undefined || code === "0x") problems.push(`${key}: no code`);
    else if (artifact.source.kind === "runtime" && code !== artifact.bytecode) {
      problems.push(`${key}: placed code differs from mainnet's`);
    }
  }

  // ENSv1 registry tree.
  yield* expect(
    "v1 root node owner",
    read("v1.registry", "owner", [zeroHash]),
    contract("v1.root"),
  );
  yield* expect("Root owner", read("v1.root", "owner"), accounts.owner);
  yield* expect(
    "eth owner",
    read("v1.registry", "owner", [namehash("eth")]),
    contract("v1.baseRegistrar"),
  );
  yield* expect(
    "addr.reverse owner",
    read("v1.registry", "owner", [namehash("addr.reverse")]),
    contract("v1.reverseRegistrar"),
  );
  yield* expect(
    "reverse resolver",
    read("v1.registry", "resolver", [namehash("reverse")]),
    contract("v1.defaultReverseResolver"),
  );
  yield* expect("old registry", read("v1.registry", "old"), contract("v1.legacyRegistry"));
  yield* expect(
    "eth resolver",
    read("v1.registry", "resolver", [namehash("eth")]),
    hasV2 ? contract("v2.ensV2Resolver") : contract("v1.ethOwnedResolver"),
  );
  for (const [name, key] of [
    ["nameWrapper", "v1.nameWrapper"],
    ["wrappedEthRegistrarController", "v1.wrappedEthRegistrarController"],
    ["ethRegistrarController", "v1.ethRegistrarController"],
    ["legacyEthRegistrarController", "v1.legacyEthRegistrarController"],
  ] as const) {
    yield* expect(
      `eth interface ${name}`,
      read("v1.ethOwnedResolver", "interfaceImplementer", [
        namehash("eth"),
        ethResolverInterfaces[name],
      ]),
      contract(key),
    );
  }
  for (const tld of dnsTlds) {
    yield* expect(
      `${tld} owner`,
      read("v1.registry", "owner", [namehash(tld)]),
      contract("v1.dnsRegistrar"),
    );
  }

  // Who registers `.eth` names: ENSv1's controllers before the launch, only ENSv2 after it.
  yield* expect(
    "BaseRegistrar owner",
    read("v1.baseRegistrar", "owner"),
    launched ? contract("v2.ethRenewerV1") : contract("v1.registrarSecurityController"),
  );
  for (const key of [
    "v1.legacyEthRegistrarController",
    "v1.ethRegistrarController",
    "v1.wrappedEthRegistrarController",
    "v1.nameWrapper",
  ]) {
    yield* expect(
      `${key} is a controller`,
      read("v1.baseRegistrar", "controllers", [contract(key)]),
      !launched,
    );
  }
  yield* expect(
    "NameWrapper owner",
    read("v1.nameWrapper", "owner"),
    launched ? zeroAddress : accounts.owner,
  );
  yield* expect("eth locked on Root", read("v1.root", "locked", [labelhash("eth")]), launched);

  if (hasV2) {
    yield* expect(
      "eth subregistry",
      read("v2.rootRegistry", "getSubregistry", ["eth"]),
      contract("v2.ethRegistry"),
    );
    yield* expect(
      "eth token holder",
      read("v2.rootRegistry", "findOwner", ["eth"]),
      launched ? accounts.nameOwner : accounts.deployer,
    );
    yield* expect(
      "reverse resolver (v2)",
      read("v2.rootRegistry", "getResolver", ["reverse"]),
      contract("v2.ensV1Resolver"),
    );
    for (const tld of dnsTlds) {
      // Reserved: no owner, resolved by the DNS TLD resolver.
      yield* expect(
        `${tld} status`,
        read("v2.rootRegistry", "getStatus", [BigInt(labelhash(tld))]),
        1,
      );
      yield* expect(
        `${tld} resolver`,
        read("v2.rootRegistry", "getResolver", [tld]),
        contract("v2.dnsTldResolver"),
      );
    }
    yield* expect(
      "ETHRegistrar roles",
      read("v2.ethRegistry", "hasRootRoles", [
        deploymentRoles.ethRegistrar,
        contract("v2.ethRegistrar"),
      ]),
      true,
    );
    yield* expect(
      "batch registrar roles",
      read("v2.ethRegistry", "hasRootRoles", [
        deploymentRoles.batchRegistrar,
        contract("v2.batchRegistrar"),
      ]),
      !launched,
    );
    for (const registry of ["v2.rootRegistry", "v2.ethRegistry"]) {
      yield* expect(`${registry} emancipated`, read(registry, "isEmancipated"), true);
    }
    yield* expect(
      "HCA implementation approved",
      read("hca.standaloneFactory", "approvedImplementations", [
        contract("hca.standaloneImplementation"),
      ]),
      true,
    );
  }

  return problems;
});
