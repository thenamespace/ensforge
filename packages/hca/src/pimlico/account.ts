import {
  standaloneHcaFactoryV2DeploymentAbi,
  standaloneHcaV2UserOperationAbi,
} from "@ensforge/contracts/internal";
import { HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import type { PreparedHcaCalls } from "@ensforge/core/legacy/hca";
import { encodeAbiParameters, encodeFunctionData, padHex } from "viem";
import {
  entryPoint07Abi,
  getUserOperationHash,
  toSmartAccount,
  type SmartAccount,
  type SmartAccountImplementation,
} from "viem/account-abstraction";

import type { PimlicoOptions } from "./types.js";

const unsupportedSignature = async (): Promise<`0x${string}`> => {
  throw new HcaError({
    code: "UNSUPPORTED_CAPABILITY",
    message: "This account codec only signs owner UserOperations",
  });
};

/** Only owner UserOperations are exposed; generic ERC-1271 signatures use another HCA format. */
export const createPimlicoAccount = async (
  options: PimlicoOptions,
  config: EnsforgeConfig,
  plan: PreparedHcaCalls,
): Promise<SmartAccount<SmartAccountImplementation<typeof entryPoint07Abi, "0.7">>> => {
  return toSmartAccount({
    client: config.publicClient,
    entryPoint: {
      address: options.profile.infrastructure.entryPoint,
      abi: entryPoint07Abi,
      version: "0.7",
    },
    getAddress: async () => plan.account.address,
    getFactoryArgs: async () => ({
      factory: options.profile.contracts.standaloneFactory,
      factoryData: encodeFunctionData({
        abi: standaloneHcaFactoryV2DeploymentAbi,
        functionName: "deploy",
        args: [plan.account.owner, plan.account.initialImplementation, plan.account.salt],
      }),
    }),
    // Key zero selects normal validation with the fixed default validator, not a module address.
    getNonce: async () =>
      config.publicClient.readContract({
        address: options.profile.infrastructure.entryPoint,
        abi: entryPoint07Abi,
        functionName: "getNonce",
        args: [plan.account.address, 0n],
      }),
    encodeCalls: async (calls) =>
      encodeFunctionData({
        abi: standaloneHcaV2UserOperationAbi,
        functionName: "execute",
        args: [
          padHex("0x01", { size: 32, dir: "right" }),
          encodeAbiParameters(
            [
              {
                type: "tuple[]",
                components: [
                  { name: "target", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "callData", type: "bytes" },
                ],
              },
            ],
            [
              calls.map((call) => ({
                target: call.to,
                value: call.value ?? 0n,
                callData: call.data ?? "0x",
              })),
            ],
          ),
        ],
      }),
    // A well-formed, non-owner signature exercises validation without authorizing anything.
    getStubSignature: async () => `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    signMessage: unsupportedSignature,
    signTypedData: unsupportedSignature,
    signUserOperation: async (operation) =>
      options.owner.signMessage({
        message: {
          raw: getUserOperationHash({
            userOperation: { ...operation, sender: plan.account.address },
            entryPointAddress: options.profile.infrastructure.entryPoint,
            entryPointVersion: "0.7",
            chainId: options.chain.id,
          }),
        },
      }),
  });
};
