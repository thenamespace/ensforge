import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { bytesToHex, encodeFunctionData, type Address, type Hex } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Rpc from "../rpc/index.js";

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
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  }).pipe(
    Effect.map((proxyLogic) => ({
      call: {
        to: options.factory,
        data: encodeFunctionData({
          abi: Abis.v2.verifiableFactory,
          functionName: "deployProxy",
          args: [options.implementation, options.salt, options.data],
        }),
        value: 0n,
      },
      address: predictVerifiableProxyAddress({
        factory: options.factory,
        proxyLogic,
        deployer: options.deployer,
        salt: options.salt,
      }),
    })),
  );

/** A random 256-bit salt. */
export const randomSalt = (): bigint =>
  BigInt(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));
