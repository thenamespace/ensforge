import { Effect, Schema } from "effect";

import {
  sepoliaHcaDeployment,
  hcaAccountGeneration,
  type HcaDeploymentProfile,
} from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import { HcaSalt } from "../../actions/hca/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import { EthereumAddress } from "../../schemas/identity.js";
import { viemErrorToEffectError } from "../errors/viem-error.js";

export const hcaRpc = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });

export const validateHcaAddress = (address: unknown) =>
  Schema.is(EthereumAddress)(address) && address !== zeroAddress
    ? Effect.succeed(address)
    : Effect.fail(
        new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Expected a nonzero HCA-related Ethereum address",
        }),
      );

export const validateHcaSalt = (salt: unknown) =>
  Schema.decodeUnknownEffect(HcaSalt)(salt).pipe(
    Effect.mapError(
      () => new HcaError({ code: "INVALID_PARAMETERS", message: "HCA salt must be a uint256" }),
    ),
  );

const HcaProfileShape = Schema.Struct({
  generation: Schema.Struct({
    id: Schema.Literal(hcaAccountGeneration.id),
    accountId: Schema.Literal(hcaAccountGeneration.accountId),
    sourceCommit: Schema.Literal(hcaAccountGeneration.sourceCommit),
    canonicalSalt: HcaSalt,
  }),
  environment: Schema.Literals(["sepolia", "devnet"]),
  contracts: Schema.Struct({
    standaloneFactory: EthereumAddress,
    standaloneImplementation: EthereumAddress,
    ownerAndSessionValidator: EthereumAddress,
    upgradeSet: EthereumAddress,
  }),
  infrastructure: Schema.Struct({
    entryPoint: EthereumAddress,
    intentExecutor: EthereumAddress,
    intentExecutorAdapter: Schema.optional(EthereumAddress),
    gasRefundPaymaster: EthereumAddress,
    paymentToken: EthereumAddress,
    secondaryPaymentToken: EthereumAddress,
  }),
  deployment: Schema.Struct({
    chainId: Schema.Int,
    protocol: Schema.Literal("v2"),
    contracts: Schema.Record(Schema.String, EthereumAddress),
    implementations: Schema.Struct({ permissionedResolver: EthereumAddress }),
  }),
});

export const resolveHcaProfile = Effect.fn("resolveHcaProfile")(function* (config: EnsforgeConfig) {
  const profile =
    config.hca ??
    (config.chainId === sepoliaHcaDeployment.deployment.chainId ? sepoliaHcaDeployment : undefined);

  if (
    !profile ||
    !Schema.is(HcaProfileShape)(profile) ||
    config.deployments.protocol !== "v2" ||
    profile.deployment.chainId !== config.chainId ||
    profile.generation.id !== hcaAccountGeneration.id ||
    profile.generation.sourceCommit !== hcaAccountGeneration.sourceCommit
  ) {
    return yield* new HcaError({
      code: "UNSUPPORTED_DEPLOYMENT",
      message: "No compatible HCA profile is configured for this ENS deployment",
    });
  }

  if ((yield* hcaRpc(() => config.publicClient.getChainId())) !== config.chainId) {
    return yield* new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "RPC chain does not match the HCA configuration",
    });
  }

  if (
    Object.keys(profile.deployment.contracts).length !==
    Object.keys(config.deployments.v2.contracts).length
  ) {
    return yield* new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "HCA profile has an incomplete ENS deployment",
    });
  }

  for (const [key, address] of Object.entries(profile.deployment.contracts)) {
    const expected =
      config.deployments.v2.contracts[key as keyof typeof config.deployments.v2.contracts];

    if (expected === undefined || !isAddressEqual(address, expected)) {
      return yield* new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "HCA profile and ENS contract addresses do not match",
      });
    }
  }

  if (
    !isAddressEqual(
      profile.deployment.implementations.permissionedResolver,
      config.deployments.v2.implementations.permissionedResolver,
    )
  ) {
    return yield* new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "HCA profile resolver implementation mismatch",
    });
  }

  return profile as HcaDeploymentProfile;
});
