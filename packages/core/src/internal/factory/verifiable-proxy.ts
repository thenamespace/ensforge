import { Effect } from "effect";

import {
  bytesToHex,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { verifiableFactoryAbi } from "../abis/v2.js";
import * as Rpc from "../rpc/index.js";

/**
 * Address of the proxy `deployer` gets from `VerifiableFactory.deployProxy` with `salt`. The
 * factory salts CREATE2 with `keccak256(abi.encode(deployer, salt))` and appends that salt to a
 * minimal proxy of its `proxyLogic` (see contracts-v2 `deployVerifiableProxy.ts`).
 */
const predictAddress = (
  factory: Address,
  proxyLogic: Address,
  deployer: Address,
  salt: bigint,
): Address => {
  const outerSalt = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [deployer, salt]),
  );
  const bytecode = concat([
    "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
    proxyLogic,
    "0x5af43d82803e903d91602b57fd5bf3",
    outerSalt,
  ]);

  return getContractAddress({ bytecode, from: factory, opcode: "CREATE2", salt: outerSalt });
};

/** The `deployProxy` call for `implementation`, initialized with `data`, and its address. */
export const deployProxy = (
  client: Client,
  options: {
    readonly factory: Address;
    readonly implementation: Address;
    readonly deployer: Address;
    readonly salt: bigint;
    readonly data: Hex;
  },
): Effect.Effect<{ readonly call: Plan.Call; readonly address: Address }, AnyError> =>
  Rpc.readContract(client, {
    address: options.factory,
    abi: verifiableFactoryAbi,
    functionName: "proxyLogic",
  }).pipe(
    Effect.map((proxyLogic) => ({
      call: {
        to: options.factory,
        data: encodeFunctionData({
          abi: verifiableFactoryAbi,
          functionName: "deployProxy",
          args: [options.implementation, options.salt, options.data],
        }),
        value: 0n,
      },
      address: predictAddress(options.factory, proxyLogic, options.deployer, options.salt),
    })),
  );

/** A random 256-bit salt. */
export const randomSalt = (): bigint =>
  BigInt(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));
