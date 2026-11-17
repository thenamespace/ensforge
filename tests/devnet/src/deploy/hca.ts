import { Effect } from "effect";

import { zeroAddress } from "viem";

import { step, type Step } from "./engine.ts";

/**
 * Canonical singletons other software expects at fixed addresses: Multicall3 (batched reads),
 * EntryPoint v0.7 and its SenderCreator (HCA UserOperations, bundlers) and Permit2. Their mainnet
 * runtime code works anywhere: none has immutables tied to mainnet (Permit2 re-derives its
 * domain separator on another chain).
 */
export const canonicalSteps: readonly Step[] = [
  step("canonical", (c) =>
    Effect.gen(function* () {
      yield* c.place("canonical.multicall3", "canonical/Multicall3");
      yield* c.place("canonical.senderCreator", "canonical/SenderCreatorV07");
      yield* c.place("canonical.entryPoint", "canonical/EntryPointV07");
      yield* c.place("canonical.permit2", "canonical/Permit2");
    }),
  ),
];

/**
 * Hosted Contract Accounts at contracts-v2 v1.0.1, and the reverse registrar adapters that need
 * the HCA factory. As on upstream's devnet, `MockRegistrationIntentExecutor` stands in for both
 * Rhinestone's IntentExecutor and its gas-refund paymaster.
 */
export const hcaSteps: readonly Step[] = [
  step("hca", (c) =>
    Effect.gen(function* () {
      const namer = yield* c.address("v2.contractNamer");
      const verifiableFactory = yield* c.address("v2.verifiableFactory");
      const executor = yield* c.deploy("hca.intentExecutor", "hca/MockRegistrationIntentExecutor");
      const factory = yield* c.deploy("hca.standaloneFactory", "hca/StandaloneHCAFactory", [
        verifiableFactory,
        c.accounts.owner,
      ]);

      const defaultAdapter = yield* c.deploy(
        "v2.defaultReverseRegistrarAdapter",
        "v2/DefaultReverseRegistrarAdapter",
        [yield* c.address("v1.defaultReverseRegistrar"), factory, namer],
      );
      yield* c.write("v1.defaultReverseRegistrar", "setController", [defaultAdapter, true], {
        from: "owner",
      });
      const adapter = yield* c.deploy("v2.reverseRegistrarAdapter", "v2/ReverseRegistrarAdapter", [
        yield* c.address("v1.reverseRegistrar"),
        factory,
        namer,
      ]);
      yield* c.write("v1.reverseRegistrar", "setController", [adapter, true], { from: "owner" });

      const validator = yield* c.deploy(
        "hca.ownerAndSessionValidator",
        "hca/HCAOwnerAndSessionValidator",
        [
          defaultAdapter,
          adapter,
          yield* c.address("v2.permissionedResolverImplementation"),
          yield* c.address("v2.ethRegistry"),
          verifiableFactory,
          executor,
          executor,
        ],
      );
      const upgradeSet = yield* c.deploy("hca.upgradeSet", "hca/HCAUpgradeSet", [c.accounts.owner]);
      const implementation = yield* c.deploy(
        "hca.standaloneImplementation",
        "hca/StandaloneHCAImplementation",
        [
          yield* c.address("canonical.entryPoint"),
          validator,
          executor,
          "0x",
          upgradeSet,
          zeroAddress,
          factory,
        ],
      );
      yield* c.write("hca.standaloneFactory", "setImplementationApproval", [implementation, true], {
        from: "owner",
      });
    }),
  ),
];
