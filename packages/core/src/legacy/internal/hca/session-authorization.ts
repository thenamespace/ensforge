import {
  encodeAbiParameters,
  hashStruct,
  hashTypedData,
  keccak256,
  maxUint256,
  zeroAddress,
  zeroHash,
  type Address,
} from "viem";

import type { HcaSessionPolicy } from "../../actions/hca/types.js";

// Standard Smart Session typed data, as reconstructed by the deployed HCASmartSessionLib.
const types = {
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

export const hcaSessionAuthorizationData = (
  hca: Address,
  chainId: number,
  policy: HcaSessionPolicy,
) => {
  const refund = policy.refund;
  const salt = keccak256(
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
        policy.sessionNonce,
        policy.validUntil,
        policy.resolver,
        refund?.token ?? zeroAddress,
        refund?.maxExchangeRate ?? 0n,
        Number(refund?.maxGasOverhead ?? 0n),
        refund?.maxAmount ?? 0n,
      ],
    ),
  );
  const sessionValidator = "0x000000000013fdB5234E4E3162a810F54d9f7E98" as const;
  const sessionValidatorInitData = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address[]" }],
    [1n, [policy.sessionKey]],
  );
  const session = {
    account: hca,
    expires: maxUint256,
    nonce: 0n,
    permissions: {
      // These are the standard Smart Session defaults hashed by HCASmartSessionLib.
      // The HCA validator independently restricts every call to its fixed ENS policy.
      actions: [
        {
          actionTargetSelector: "0x00000001" as const,
          actionTarget: "0x0000000000000000000000000000000000000001" as const,
          actionPolicies: [
            {
              policy: "0x0000003111cd8e92337c100f22b7a9dbf8dee301" as const,
              initData: "0x" as const,
            },
          ],
        },
      ],
      erc7739Policies: {
        allowedERC7739Content: [{ contentName: [""], appDomainSeparator: zeroHash }],
        erc1271Policies: [
          {
            policy: "0x0000003111cd8e92337c100f22b7a9dbf8dee301" as const,
            initData: "0x" as const,
          },
        ],
      },
      lockTagPolicies: { lockTag: "0x000000000000000000000000" as const, claimPolicies: [] },
      permitGenericPolicy: true,
    },
    salt,
    sessionValidator,
    sessionValidatorInitData,
    smartSessionEmissary: "0xad568B3F825A8d5FFc06DD3253526B64D810Ae89" as const,
  };
  const data = {
    domain: { name: "SmartSessionEmissary", version: "1" },
    types,
    primaryType: "MultiChainSession" as const,
    message: { sessionsAndChainIds: [{ chainId: BigInt(chainId), session }] },
  };
  const permissionId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }, { type: "bytes32" }],
      [sessionValidator, sessionValidatorInitData, salt],
    ),
  );

  return {
    data,
    salt,
    permissionId,
    sessionDigest: hashStruct({ types, primaryType: "SignedSession", data: session }),
    digest: hashTypedData(data),
  };
};
