import { bytesToHex, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** What a registration commits to (ETHRegistrar `makeCommitment`). */
export type CommitmentInput = {
  readonly label: string;
  readonly owner: Address;
  readonly secret: Hex;
  readonly subregistry: Address;
  readonly resolver: Address;
  readonly duration: bigint;
  readonly referrer: Hex;
};

/** `keccak256(abi.encode(label, owner, secret, subregistry, resolver, duration, referrer))`. */
export const makeCommitment = (input: CommitmentInput): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [
        input.label,
        input.owner,
        input.secret,
        input.subregistry,
        input.resolver,
        input.duration,
        input.referrer,
      ],
    ),
  );

/** A random commitment secret. */
export const randomSecret = (): Hex => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/**
 * CREATE2 salt of the resolver deployed for `label`. Derived from the secret so a resumed
 * registration recomputes the same resolver address its commitment contains.
 */
export const resolverSalt = (secret: Hex, label: string): bigint =>
  BigInt(
    keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [secret, label])),
  );
