import { concatHex, encodeAbiParameters, getCreate2Address, keccak256, type Address } from "viem";

/** Matches StandaloneHCAFactory plus the matched VerifiableFactory CloneProxyBytecode. */
export const deriveHcaAddress = (
  owner: Address,
  implementation: Address,
  salt: bigint,
  factory: Address,
  verifiableFactory: Address,
  proxyLogic: Address,
) => {
  const innerSalt = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }],
      [salt, owner, implementation],
    ),
  );

  const outerSalt = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [factory, BigInt(innerSalt)]),
  );

  const bytecode = concatHex([
    "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
    proxyLogic,
    "0x5af43d82803e903d91602b57fd5bf3",
    outerSalt,
  ]);

  return getCreate2Address({ from: verifiableFactory, salt: outerSalt, bytecode });
};
