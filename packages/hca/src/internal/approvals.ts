import { Abis } from "@ensforge/contracts";
import type { Plan } from "@ensforge/sdk";
import { encodeFunctionData, hexToBigInt, isAddressEqual, labelhash, type Address } from "viem";

import { decodeCall } from "./decode.js";

/**
 * The approvals the owner gives so the owner's name tokens can move: to the HCA when it moves
 * them itself, the `.eth` registrar token per id (cleared by the transfer) and NameWrapper for
 * all (left in place); to MigrationHelper when the HCA migrates through it, in which case the
 * NameWrapper approval is `helperOperator`, for the route to revoke afterwards.
 */
export const tokenApprovals = (
  calls: readonly Plan.Call[],
  options: {
    readonly owner: Address;
    readonly hca: Address;
    readonly baseRegistrar: Address | undefined;
    readonly nameWrapper: Address | undefined;
    readonly migrationHelper: Address | undefined;
  },
): {
  readonly calls: readonly Plan.Call[];
  readonly wrapper: boolean;
  readonly helperOperator: Plan.Call | undefined;
} => {
  const approvals: Plan.Call[] = [];
  let wrapper = false;
  let helperOperator: Plan.Call | undefined;
  const { baseRegistrar, nameWrapper, migrationHelper } = options;

  for (const call of calls) {
    if (migrationHelper !== undefined && isAddressEqual(call.to, migrationHelper)) {
      const decoded = decodeCall(Abis.v2.migrationHelper, call.data);
      if (decoded?.functionName !== "migrate") continue;
      const [unwrapped, unlocked, locked, children] = decoded.args;
      if (baseRegistrar !== undefined) {
        for (const data of unwrapped) {
          approvals.push({
            to: baseRegistrar,
            data: encodeFunctionData({
              abi: Abis.v1.baseRegistrar,
              functionName: "approve",
              args: [migrationHelper, hexToBigInt(labelhash(data.label))],
            }),
            value: 0n,
          });
        }
      }
      const wrappedNames = unlocked.length + locked.length + children.length;
      if (nameWrapper !== undefined && wrappedNames > 0 && helperOperator === undefined) {
        helperOperator = {
          to: nameWrapper,
          data: encodeFunctionData({
            abi: Abis.v1.nameWrapper,
            functionName: "setApprovalForAll",
            args: [migrationHelper, true],
          }),
          value: 0n,
        };
      }
      continue;
    }
    if (options.baseRegistrar !== undefined && isAddressEqual(call.to, options.baseRegistrar)) {
      const decoded = decodeCall(Abis.v1.baseRegistrar, call.data);
      if (
        (decoded?.functionName === "safeTransferFrom" ||
          decoded?.functionName === "transferFrom") &&
        isAddressEqual(decoded.args[0], options.owner)
      ) {
        const [, , tokenId] = decoded.args;
        approvals.push({
          to: options.baseRegistrar,
          data: encodeFunctionData({
            abi: Abis.v1.baseRegistrar,
            functionName: "approve",
            args: [options.hca, tokenId],
          }),
          value: 0n,
        });
      }
    }
    if (
      options.nameWrapper !== undefined &&
      isAddressEqual(call.to, options.nameWrapper) &&
      !wrapper
    ) {
      const decoded = decodeCall(Abis.v1.nameWrapper, call.data);
      if (
        (decoded?.functionName === "safeTransferFrom" ||
          decoded?.functionName === "safeBatchTransferFrom") &&
        isAddressEqual(decoded.args[0], options.owner)
      ) {
        wrapper = true;
        approvals.push({
          to: options.nameWrapper,
          data: encodeFunctionData({
            abi: Abis.v1.nameWrapper,
            functionName: "setApprovalForAll",
            args: [options.hca, true],
          }),
          value: 0n,
        });
      }
    }
  }

  return { calls: approvals, wrapper, helperOperator };
};
