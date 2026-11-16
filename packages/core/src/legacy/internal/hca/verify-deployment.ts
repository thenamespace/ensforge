import { Effect } from "effect";

import {
  hcaImplementationRuntime,
  type HcaDeploymentProfile,
  hcaValidatorV2WiringAbi,
  standaloneHcaFactoryV2DeploymentAbi,
  standaloneHcaV2InspectionAbi,
  verifiableFactoryV2ProxyLogicAbi,
} from "@ensforge/contracts/internal";
import {
  standaloneSingleOwnerHcaV2Abi,
  hcaAuthorizerV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import {
  isAddressEqual,
  keccak256,
  padHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { HcaError } from "../../errors/hca-error.js";

const expectAddress = (name: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected))
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
};

/** Read-only wiring verification at one block; this does not certify bundler compatibility. */
export interface HcaWiringVerification {
  readonly blockNumber: bigint;
  readonly proxyLogic: Address;
  readonly entryPointDeployed: boolean;
}

export const verifyHcaDeployment: (
  client: PublicClient,
  profile: HcaDeploymentProfile,
  atBlock?: bigint,
) => Effect.Effect<HcaWiringVerification, HcaError> = Effect.fn("verifyHcaDeployment")(function* (
  client: PublicClient,
  profile: HcaDeploymentProfile,
  atBlock?: bigint,
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const { contracts: hca, deployment, infrastructure } = profile;

      if ((await client.getChainId()) !== deployment.chainId) throw new Error("HCA chain mismatch");

      if (
        !(
          (profile.environment === "sepolia" && deployment.chainId === 11155111) ||
          (profile.environment === "devnet" && deployment.chainId === 31337)
        )
      ) {
        throw new Error("Unsupported HCA environment");
      }

      const blockNumber = atBlock ?? (await client.getBlockNumber());

      await Promise.all(
        [
          ...Object.values(hca),
          infrastructure.intentExecutor,
          deployment.contracts.verifiableFactory,
          deployment.contracts.defaultReverseRegistrarAdapter,
          deployment.implementations.permissionedResolver,
        ].map(async (address) => {
          const code = await client.getCode({ address, blockNumber });

          if (!code || code === "0x") throw new Error(`HCA dependency has no code: ${address}`);
        }),
      );

      const factory = {
        address: hca.standaloneFactory,
        abi: standaloneHcaFactoryV2DeploymentAbi,
        blockNumber,
      } as const;

      expectAddress(
        "factory",
        await client.readContract({ ...factory, functionName: "VERIFIABLE_FACTORY" }),
        deployment.contracts.verifiableFactory,
      );

      const implementationCode = await client.getCode({
        address: hca.standaloneImplementation,
        blockNumber,
      });

      if (!implementationCode) throw new Error("HCA implementation has no code");

      const validatorWord = padHex(hca.ownerAndSessionValidator.toLowerCase() as Address, {
        size: 32,
      }).slice(2);

      for (const offset of hcaImplementationRuntime.defaultValidatorWordOffsets) {
        if (implementationCode.slice(2 + offset * 2, 2 + (offset + 32) * 2) !== validatorWord)
          throw new Error("HCA default validator immutable mismatch");
      }

      if (
        (implementationCode.length - 2) / 2 !== hcaImplementationRuntime.runtimeBytes ||
        implementationCode.slice(-4) !== "0033"
      )
        throw new Error("HCA runtime layout mismatch");

      let template: Hex = implementationCode;

      for (const offset of hcaImplementationRuntime.immutableWordOffsets) {
        template = `0x${template.slice(2, 2 + offset * 2)}${"0".repeat(64)}${template.slice(2 + (offset + 32) * 2)}`;
      }

      if (
        keccak256(template.slice(0, -hcaImplementationRuntime.metadataBytes * 2) as Hex) !==
        hcaImplementationRuntime.templateHash
      )
        throw new Error("HCA runtime does not match the pinned artifact template");

      const account = {
        address: hca.standaloneImplementation,
        abi: standaloneHcaV2InspectionAbi,
        blockNumber,
      } as const;

      if (
        (await client.readContract({ ...account, functionName: "accountId" })) !==
        profile.generation.accountId
      )
        throw new Error("HCA account generation mismatch");

      expectAddress(
        "EntryPoint",
        await client.readContract({ ...account, functionName: "entryPoint" }),
        infrastructure.entryPoint,
      );

      expectAddress(
        "upgrade gate",
        await client.readContract({ ...account, functionName: "UPGRADE_SET" }),
        hca.upgradeSet,
      );

      expectAddress(
        "initial predecessor gate",
        await client.readContract({ ...account, functionName: "PREDECESSOR_UPGRADE_SET" }),
        zeroAddress,
      );

      if (
        !(await client.readContract({
          ...account,
          functionName: "isModuleInstalled",
          args: [2n, infrastructure.intentExecutor, "0x"],
        }))
      )
        throw new Error("HCA default executor is missing");

      expectAddress(
        "HCA owner registry",
        await client.readContract({
          address: hca.standaloneImplementation,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "OWNER_REGISTRY",
          blockNumber,
        }),
        hca.standaloneFactory,
      );

      const proxyLogic = await client.readContract({
        address: deployment.contracts.verifiableFactory,
        abi: verifiableFactoryV2ProxyLogicAbi,
        functionName: "proxyLogic",
        blockNumber,
      });

      const proxyCode = await client.getCode({ address: proxyLogic, blockNumber });

      if (!proxyCode || proxyCode === "0x") throw new Error("Verifiable proxy logic has no code");

      const wiring = {
        DEFAULT_REVERSE_REGISTRAR_HCA_ADAPTER: deployment.contracts.defaultReverseRegistrarAdapter,
        PERMITTED_RESOLVER_IMPL: deployment.implementations.permissionedResolver,
        ETH_REGISTRY: deployment.contracts.ethRegistry,
        REVERSE_REGISTRAR_HCA_ADAPTER: deployment.contracts.reverseRegistrarAdapter,
        VERIFIABLE_FACTORY: deployment.contracts.verifiableFactory,
        VERIFIABLE_PROXY_LOGIC: proxyLogic,
        INTENT_EXECUTOR: infrastructure.intentExecutor,
        GAS_REFUND_PAYMASTER: infrastructure.gasRefundPaymaster,
      } as const;

      await Promise.all(
        (Object.keys(wiring) as (keyof typeof wiring)[]).map(async (functionName) => {
          expectAddress(
            functionName,
            await client.readContract({
              address: hca.ownerAndSessionValidator,
              abi: hcaValidatorV2WiringAbi,
              functionName,
              blockNumber,
            }),
            wiring[functionName],
          );
        }),
      );

      await Promise.all(
        [
          deployment.contracts.defaultReverseRegistrarAdapter,
          deployment.contracts.reverseRegistrarAdapter,
        ].map(async (address) => {
          expectAddress(
            "reverse HCA authorizer",
            await client.readContract({
              address,
              abi: hcaAuthorizerV2Abi,
              functionName: "STANDALONE_HCA_FACTORY",
              blockNumber,
            }),
            hca.standaloneFactory,
          );
        }),
      );

      const entryPointCode = await client.getCode({
        address: infrastructure.entryPoint,
        blockNumber,
      });

      const entryPointDeployed = Boolean(entryPointCode) && entryPointCode !== "0x";

      if (profile.environment === "sepolia" && !entryPointDeployed) {
        throw new Error("Recorded Sepolia EntryPoint has no code");
      }

      return {
        blockNumber,
        proxyLogic,
        entryPointDeployed,
      };
    },
    catch: (cause) =>
      new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "HCA deployment wiring verification failed",
        cause,
      }),
  });
});
