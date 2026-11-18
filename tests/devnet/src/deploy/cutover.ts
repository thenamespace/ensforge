import { Effect } from "effect";

import { deploymentRoles, ethLabelhash } from "./constants.ts";
import { step, type Step } from "./engine.ts";

/**
 * Mainnet's launch on top of the greenfield deployment (contracts-v2 `docs/migration.md` phases
 * 3–8 and `activateV2`): ENSv1 stops registering, `ETHRenewerV1` takes over the BaseRegistrar,
 * the batch registrar loses its roles, and the registries pass from the deployer to the owner.
 */
export const cutoverSteps: readonly Step[] = [
  step("cutover.v1", (c) =>
    Effect.gen(function* () {
      const owner = { from: "owner" } as const;
      yield* c.write("v1.nameWrapper", "renounceOwnership", [], owner);
      // No ENSv1 path registers `.eth` names any more; the wrapped controller registers through
      // the NameWrapper.
      for (const controller of [
        "v1.legacyEthRegistrarController",
        "v1.ethRegistrarController",
        "v1.wrappedEthRegistrarController",
        "v1.nameWrapper",
      ]) {
        yield* c.write(
          "v1.registrarSecurityController",
          "removeRegistrarController",
          [yield* c.address(controller)],
          owner,
        );
      }
      yield* c.write(
        "v1.registrarSecurityController",
        "addRegistrarController",
        [yield* c.address("v2.graveyard")],
        owner,
      );
      const renewer = yield* c.address("v2.ethRenewerV1");
      yield* c.write("v1.registrarSecurityController", "addRegistrarController", [renewer], owner);
      // Last: renewals sync the wrapper through owner-only BaseRegistrar calls.
      yield* c.write(
        "v1.registrarSecurityController",
        "transferRegistrarOwnership",
        [renewer],
        owner,
      );
      yield* c.write("v1.root", "lock", [ethLabelhash], owner);
    }),
  ),

  step("cutover.v2", (c) =>
    Effect.gen(function* () {
      yield* c.write("v2.ethRegistry", "revokeRootRoles", [
        deploymentRoles.batchRegistrar,
        yield* c.address("v2.batchRegistrar"),
      ]);

      // Registry hand-over: root names to the name owner, root roles to the owner, nothing left
      // with the deployer.
      for (const label of ["eth", "reverse"]) {
        const tokenId = yield* c.read<bigint>("v2.rootRegistry", "findTokenId", [label]);
        yield* c.write("v2.rootRegistry", "safeTransferFrom", [
          c.accounts.deployer,
          c.accounts.nameOwner,
          tokenId,
          1n,
          "0x",
        ]);
      }
      for (const registry of ["v2.rootRegistry", "v2.ethRegistry"]) {
        const resource = yield* c.read<bigint>(registry, "ROOT_RESOURCE");
        yield* c.write(registry, "grantRootRoles", [
          deploymentRoles.registryOwnerRoot,
          c.accounts.owner,
        ]);
        const deployerRoles = yield* c.read<bigint>(registry, "roles", [
          resource,
          c.accounts.deployer,
        ]);
        if (deployerRoles !== 0n) {
          yield* c.write(registry, "revokeRootRoles", [deployerRoles, c.accounts.deployer]);
        }
      }
      yield* c.write("v2.batchRegistrar", "renounceOwnership");
      yield* c.write("v2.rootBatchRegistrar", "renounceOwnership");
    }),
  ),
];
