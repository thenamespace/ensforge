import { concat, encodeAbiParameters, getContractAddress, keccak256, type Address } from "viem";

/**
 * Address of the proxy that `VerifiableFactory.deployProxy(implementation, salt, data)` deploys
 * when called by `deployer`. The factory salts CREATE2 with `keccak256(abi.encode(deployer, salt))`
 * and appends that salt to a minimal proxy of its `proxyLogic()`.
 *
 * **Example** (Predicting a PermissionedResolver address)
 *
 * ```ts
 * import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2"
 *
 * const resolver = predictVerifiableProxyAddress({ factory, proxyLogic, deployer: account, salt: 1n })
 * ```
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/test/integration/fixtures/deployVerifiableProxy.ts
 * @stability stable
 * @since 1.0.0
 */
export const predictVerifiableProxyAddress = (options: {
  /** The VerifiableFactory. */
  readonly factory: Address;
  /** The factory's `proxyLogic()`. */
  readonly proxyLogic: Address;
  /** `msg.sender` of `deployProxy`. */
  readonly deployer: Address;
  readonly salt: bigint;
}): Address => {
  const outerSalt = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [options.deployer, options.salt],
    ),
  );
  const bytecode = concat([
    "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
    options.proxyLogic,
    "0x5af43d82803e903d91602b57fd5bf3",
    outerSalt,
  ]);

  return getContractAddress({
    bytecode,
    from: options.factory,
    opcode: "CREATE2",
    salt: outerSalt,
  });
};
