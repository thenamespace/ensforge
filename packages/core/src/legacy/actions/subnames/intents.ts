import { Effect } from "effect";

import {
  ensRegistryV1SetSubnodeRecordAbi,
  nameWrapperV1SetSubnodeRecordAbi,
  permissionedRegistryV2InterfaceRegisterAbi,
  permissionedRegistryV2InterfaceSetSubregistryAbi,
  userRegistryV2InitializeAbi,
  userRegistryV2SetParentAbi,
  verifiableFactoryV2DeployProxyAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { makeWriteIntent, type EnsWriteIntentPreparer } from "../../action/write-intent.js";
import { ContractError } from "../../errors/contract-error.js";
import type { EthereumAddress } from "../../schemas/identity.js";
import type { EnsProtocol } from "../../schemas/protocol.js";
import type { CallExecutionResult, WriteError } from "../../write/types.js";

interface EncodedIntentParameters {
  readonly operation: string;
  readonly protocol: EnsProtocol;
  readonly to: EthereumAddress;
  readonly data: `0x${string}`;
}

const prepareEncoded: EnsWriteIntentPreparer<EncodedIntentParameters, WriteError> = Effect.fn(
  "ensforge.subname.prepareEncoded",
)((_config, parameters) =>
  Effect.succeed({
    to: parameters.to,
    data: parameters.data,
    value: 0n,
    protocol: parameters.protocol,
  }),
);

const encodedIntent = (parameters: EncodedIntentParameters) =>
  makeWriteIntent<EncodedIntentParameters, CallExecutionResult, WriteError>(
    parameters.operation,
    parameters,
    prepareEncoded,
  );

const encode = (operation: string, thunk: () => `0x${string}`) =>
  Effect.try({
    try: thunk,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation}`,
        cause,
      }),
  });

export const v1CreateSubnameIntent = Effect.fn("ensforge.v1CreateSubnameIntent")(
  function* (parameters: {
    readonly registry: EthereumAddress;
    readonly wrapper: EthereumAddress;
    readonly parentWrapped: boolean;
    readonly parentNode: `0x${string}`;
    readonly label: string;
    readonly labelhash: `0x${string}`;
    readonly owner: EthereumAddress;
    readonly resolver: EthereumAddress;
    readonly ttl: bigint;
    readonly fuses: number;
    readonly expiry: bigint;
  }) {
    const data = yield* encode("the V1 subname creation", () =>
      parameters.parentWrapped
        ? encodeFunctionData({
            abi: nameWrapperV1SetSubnodeRecordAbi,
            functionName: "setSubnodeRecord",
            args: [
              parameters.parentNode,
              parameters.label,
              parameters.owner,
              parameters.resolver,
              parameters.ttl,
              parameters.fuses,
              parameters.expiry,
            ],
          })
        : encodeFunctionData({
            abi: ensRegistryV1SetSubnodeRecordAbi,
            functionName: "setSubnodeRecord",
            args: [
              parameters.parentNode,
              parameters.labelhash,
              parameters.owner,
              parameters.resolver,
              parameters.ttl,
            ],
          }),
    );

    return encodedIntent({
      operation: "createSubname",
      protocol: "v1",
      to: parameters.parentWrapped ? parameters.wrapper : parameters.registry,
      data,
    });
  },
);

export const deployUserRegistryIntent = Effect.fn("ensforge.deployUserRegistryIntent")(
  function* (parameters: {
    readonly factory: EthereumAddress;
    readonly implementation: EthereumAddress;
    readonly owner: EthereumAddress;
    readonly roles: bigint;
    readonly salt: bigint;
  }) {
    const data = yield* encode("the ENSv2 User Registry deployment", () => {
      const initialization = encodeFunctionData({
        abi: userRegistryV2InitializeAbi,
        functionName: "initialize",
        args: [[{ account: parameters.owner, roleBitmap: parameters.roles }]],
      });

      return encodeFunctionData({
        abi: verifiableFactoryV2DeployProxyAbi,
        functionName: "deployProxy",
        args: [parameters.implementation, parameters.salt, initialization],
      });
    });

    return encodedIntent({
      operation: "createSubregistry",
      protocol: "v2",
      to: parameters.factory,
      data,
    });
  },
);

export const setRegistryParentIntent = Effect.fn("ensforge.setRegistryParentIntent")(
  function* (parameters: {
    readonly registry: EthereumAddress;
    readonly parentRegistry: EthereumAddress;
    readonly parentLabel: string;
  }) {
    const data = yield* encode("the ENSv2 registry parent update", () =>
      encodeFunctionData({
        abi: userRegistryV2SetParentAbi,
        functionName: "setParent",
        args: [parameters.parentRegistry, parameters.parentLabel],
      }),
    );

    return encodedIntent({
      operation: "setSubregistryParent",
      protocol: "v2",
      to: parameters.registry,
      data,
    });
  },
);

export const attachSubregistryIntent = Effect.fn("ensforge.attachSubregistryIntent")(
  function* (parameters: {
    readonly parentRegistry: EthereumAddress;
    readonly parentTokenId: bigint;
    readonly subregistry: EthereumAddress;
  }) {
    const data = yield* encode("the ENSv2 subregistry attachment", () =>
      encodeFunctionData({
        abi: permissionedRegistryV2InterfaceSetSubregistryAbi,
        functionName: "setSubregistry",
        args: [parameters.parentTokenId, parameters.subregistry],
      }),
    );

    return encodedIntent({
      operation: "attachSubregistry",
      protocol: "v2",
      to: parameters.parentRegistry,
      data,
    });
  },
);

export const registerV2SubnameIntent = Effect.fn("ensforge.registerV2SubnameIntent")(
  function* (parameters: {
    readonly registry: EthereumAddress;
    readonly label: string;
    readonly owner: EthereumAddress;
    readonly resolver: EthereumAddress;
    readonly roles: bigint;
    readonly expiry: bigint;
  }) {
    const data = yield* encode("the ENSv2 subname registration", () =>
      encodeFunctionData({
        abi: permissionedRegistryV2InterfaceRegisterAbi,
        functionName: "register",
        args: [
          parameters.label,
          parameters.owner,
          "0x0000000000000000000000000000000000000000",
          parameters.resolver,
          parameters.roles,
          parameters.expiry,
        ],
      }),
    );

    return encodedIntent({
      operation: "createSubname",
      protocol: "v2",
      to: parameters.registry,
      data,
    });
  },
);
