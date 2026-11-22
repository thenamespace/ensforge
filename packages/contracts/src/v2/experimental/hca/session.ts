import {
  encodeAbiParameters,
  hashStruct,
  hashTypedData,
  keccak256,
  maxUint256,
  type Address,
  type Hex,
} from "viem";

/**
 * `accountId()` of the standalone single-owner HCA at contracts-v2 v1.0.1.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaAccountId = "ens-standalone-hca.1.1.0";

/**
 * Rhinestone SmartSessionEmissary. HCA session approvals name it inside the signed session; the
 * HCA never calls it.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSmartSessionEmissary: Address = "0xad568B3F825A8d5FFc06DD3253526B64D810Ae89";

/**
 * Rhinestone one-of-one Ownable session validator named in HCA session approvals.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaOwnableSessionValidator: Address = "0x000000000013fdB5234E4E3162a810F54d9f7E98";

/**
 * EIP-712 domain of HCA session approvals at contracts-v2 v1.0.1 (Rhinestone's Smart Session
 * domain, without a chain ID: one signature covers several chains).
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionDomain = { name: "SmartSessionEmissary", version: "1" } as const;

/**
 * EIP-712 types of an HCA session approval (Rhinestone multi-chain Smart Session).
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionTypes = {
  PolicyData: [
    { name: "policy", type: "address" },
    { name: "initData", type: "bytes" },
  ],
  ActionData: [
    { name: "actionTargetSelector", type: "bytes4" },
    { name: "actionTarget", type: "address" },
    { name: "actionPolicies", type: "PolicyData[]" },
  ],
  ERC7739Context: [
    { name: "appDomainSeparator", type: "bytes32" },
    { name: "contentName", type: "string[]" },
  ],
  ERC7739Data: [
    { name: "allowedERC7739Content", type: "ERC7739Context[]" },
    { name: "erc1271Policies", type: "PolicyData[]" },
  ],
  LockTagData: [
    { name: "lockTag", type: "bytes12" },
    { name: "claimPolicies", type: "PolicyData[]" },
  ],
  SignedPermissions: [
    { name: "actions", type: "ActionData[]" },
    { name: "erc7739Policies", type: "ERC7739Data" },
    { name: "lockTagPolicies", type: "LockTagData" },
    { name: "permitGenericPolicy", type: "bool" },
  ],
  SignedSession: [
    { name: "account", type: "address" },
    { name: "expires", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "permissions", type: "SignedPermissions" },
    { name: "salt", type: "bytes32" },
    { name: "sessionValidator", type: "address" },
    { name: "sessionValidatorInitData", type: "bytes" },
    { name: "smartSessionEmissary", type: "address" },
  ],
  ChainSession: [
    { name: "chainId", type: "uint64" },
    { name: "session", type: "SignedSession" },
  ],
  MultiChainSession: [{ name: "sessionsAndChainIds", type: "ChainSession[]" }],
} as const;

/**
 * The fixed limits an HCA session approval binds besides its key and account.
 *
 * @stability experimental
 * @since 1.0.0
 */
export type HcaSessionTerms = {
  /** The HCA's current session nonce; `revokeSessions()` increments it. */
  readonly sessionNonce: bigint;
  /** Unix seconds after which the session is invalid. */
  readonly validUntil: number;
  /** The one resolver the session may deploy or write to. */
  readonly resolver: Address;
  /** Token the intent executor is reimbursed in. */
  readonly refundToken: Address;
  readonly maxRefundExchangeRate: bigint;
  readonly maxRefundGasOverhead: bigint;
  readonly maxRefundAmount: bigint;
};

/**
 * The session salt: the terms an HCA session approval binds, as the validator hashes them.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionSalt = (terms: HcaSessionTerms): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "uint96" },
        { type: "uint48" },
        { type: "address" },
        { type: "address" },
        { type: "uint96" },
        { type: "uint48" },
        { type: "uint96" },
      ],
      [
        terms.sessionNonce,
        terms.validUntil,
        terms.resolver,
        terms.refundToken,
        terms.maxRefundExchangeRate,
        Number(terms.maxRefundGasOverhead),
        terms.maxRefundAmount,
      ],
    ),
  );

// Rhinestone's sudo policy. The SDK's default session permissions are unrestricted; the HCA
// validator ignores them and enforces its own fixed policy, but the signed message must contain
// exactly these for the digest to match.
const sudoPolicy = {
  policy: "0x0000003111cD8e92337C100F22B7A9dbf8DEE301",
  initData: "0x",
} as const;

const defaultPermissions = {
  actions: [
    {
      actionTargetSelector: "0x00000001",
      actionTarget: "0x0000000000000000000000000000000000000001",
      actionPolicies: [sudoPolicy],
    },
  ],
  erc7739Policies: {
    allowedERC7739Content: [
      {
        appDomainSeparator: "0x0000000000000000000000000000000000000000000000000000000000000000",
        contentName: [""],
      },
    ],
    erc1271Policies: [sudoPolicy],
  },
  lockTagPolicies: { lockTag: "0x000000000000000000000000", claimPolicies: [] },
  permitGenericPolicy: true,
} as const;

/**
 * The `SignedSession` message of an HCA session: Rhinestone's default permissions (the HCA
 * validator enforces its own fixed policy instead), the key in a one-of-one Ownable validator and
 * the terms in the salt.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSignedSession = (options: {
  readonly account: Address;
  readonly sessionKey: Address;
  readonly salt: Hex;
}) =>
  ({
    account: options.account,
    expires: maxUint256,
    nonce: 0n,
    permissions: defaultPermissions,
    salt: options.salt,
    sessionValidator: hcaOwnableSessionValidator,
    sessionValidatorInitData: encodeAbiParameters(
      [{ type: "uint256" }, { type: "address[]" }],
      [1n, [options.sessionKey]],
    ),
    smartSessionEmissary: hcaSmartSessionEmissary,
  }) as const;

/**
 * Smart Session permission id of an HCA session, as the validator derives it.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionPermissionId = (options: {
  readonly sessionKey: Address;
  readonly salt: Hex;
}): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }, { type: "bytes32" }],
      [
        hcaOwnableSessionValidator,
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "address[]" }],
          [1n, [options.sessionKey]],
        ),
        options.salt,
      ],
    ),
  );

/**
 * Struct hash of one signed session: the per-chain digest a multi-chain approval lists.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionDigest = (session: ReturnType<typeof hcaSignedSession>): Hex =>
  hashStruct({ types: hcaSessionTypes, primaryType: "SignedSession", data: session });

/**
 * EIP-712 typed data the HCA owner signs to approve sessions on one or more chains.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionTypedData = (
  sessions: readonly {
    readonly chainId: number;
    readonly session: ReturnType<typeof hcaSignedSession>;
  }[],
) =>
  ({
    domain: hcaSessionDomain,
    types: hcaSessionTypes,
    primaryType: "MultiChainSession",
    message: {
      sessionsAndChainIds: sessions.map(({ chainId, session }) => ({
        chainId: BigInt(chainId),
        session,
      })),
    },
  }) as const;

/**
 * The digest an HCA owner signs for a multi-chain session approval.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaSessionApprovalDigest = (
  sessions: Parameters<typeof hcaSessionTypedData>[0],
): Hex => hashTypedData(hcaSessionTypedData(sessions));

/**
 * `StandaloneHCAFactory` deployment salt: the HCA address is the VerifiableFactory proxy the
 * factory deploys with it.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaDeploymentSalt = (options: {
  readonly owner: Address;
  readonly implementation: Address;
  readonly userSalt?: bigint | undefined;
}): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }],
      [options.userSalt ?? 0n, options.owner, options.implementation],
    ),
  );

/**
 * Refund ceilings for a new HCA session, sized like the ENS app's: four times a quoted gas
 * overhead, between 500k and 100M gas, with $20k per ETH and 100 USDC per intent. Without a quote
 * the overhead ceiling is 500k.
 *
 * **Details**
 *
 * - The overhead ceiling also bounds what a relayer may charge per intent, so size it from a
 *   quote instead of raising it to the maximum.
 *
 * **Example** (Sizing caps from a quote)
 *
 * ```ts
 * import { hcaRefundCaps } from "@ensforge/contracts/v2/experimental/hca"
 *
 * const caps = hcaRefundCaps(3_000_000n) // maxGasOverhead: 12_000_000n
 * ```
 *
 * @stability experimental
 * @since 1.2.0
 */
export const hcaRefundCaps = (
  quotedGasOverhead?: bigint,
): {
  readonly maxExchangeRate: bigint;
  readonly maxGasOverhead: bigint;
  readonly maxAmount: bigint;
} => {
  const floor = 500_000n;
  const ceiling = 100_000_000n;
  const sized = (quotedGasOverhead ?? 0n) * 4n;
  return {
    maxExchangeRate: 20_000_000_000n,
    maxGasOverhead: sized < floor ? floor : sized > ceiling ? ceiling : sized,
    maxAmount: 100_000_000n,
  };
};
