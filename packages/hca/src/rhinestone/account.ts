import { getHcaDeployment, verifiableFactoryV2ProxyLogicAbi } from "@ensforge/contracts/internal";
import { HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import { verifyHca } from "@ensforge/core/legacy/hca";
import type { RhinestoneSDK, Session } from "@rhinestone/sdk";
import type { Address, Hex } from "viem";

import type { RhinestoneOptions } from "./types.js";

export const sessionFor = (options: RhinestoneOptions, hca: Address, salt: Hex): Session => ({
  chain: options.chain,
  account: hca,
  salt,
  owners: { type: "ecdsa", accounts: [options.sessionSigner] },
});

export const createRhinestoneHca = async (
  options: RhinestoneOptions,
  sdk: RhinestoneSDK,
  config: EnsforgeConfig,
  hca: Address,
  salt = 0n,
) => {
  const account = await verifyHca(config, { hca, salt, expectedOwner: options.owner.address });
  const profile = options.profile;
  const configured = config.hca ?? getHcaDeployment(config.chainId);

  for (const section of ["contracts", "infrastructure"] as const) {
    if (
      Object.entries(profile[section]).some(
        ([key, address]) =>
          address.toLowerCase() !==
          (configured[section] as unknown as Record<string, string>)[key]?.toLowerCase(),
      )
    )
      throw new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "Rhinestone profile differs from the verified SDK configuration",
      });
  }

  if (
    config.chainId !== options.chain.id ||
    account.profileId !== profile.generation.id ||
    account.currentImplementation.toLowerCase() !==
      profile.contracts.standaloneImplementation.toLowerCase() ||
    (
      config.hca?.contracts.ownerAndSessionValidator ?? profile.contracts.ownerAndSessionValidator
    ).toLowerCase() !== profile.contracts.ownerAndSessionValidator.toLowerCase()
  )
    throw new HcaError({
      code: "ACCOUNT_MISMATCH",
      message: "Rhinestone requires the configured verified HCA deployment",
    });

  const proxyLogic = await config.publicClient.readContract({
    address: profile.deployment.contracts.verifiableFactory,
    abi: verifiableFactoryV2ProxyLogicAbi,
    functionName: "proxyLogic",
  });

  const result = await sdk.createAccount({
    initData: { address: hca },
    account: {
      type: "hca",
      version: "ens-standalone-1.1.0",
      factory: profile.contracts.standaloneFactory,
      implementation: profile.contracts.standaloneImplementation,
      validator: profile.contracts.ownerAndSessionValidator,
      verifiableFactory: profile.deployment.contracts.verifiableFactory,
      proxyLogic,
      userSalt: salt,
    },
    owners: {
      type: "ecdsa",
      accounts: [options.owner],
      module: profile.contracts.ownerAndSessionValidator,
    },
    experimental_sessions: { enabled: true, module: profile.contracts.ownerAndSessionValidator },
  });

  if (result.getAddress().toLowerCase() !== hca.toLowerCase())
    throw new HcaError({
      code: "ACCOUNT_MISMATCH",
      message: "SDK HCA derivation mismatch; install the ENSforge Rhinestone 1.8.0 patch",
    });

  return { account, rhinestoneAccount: result };
};
