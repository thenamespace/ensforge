import { Abis } from "@ensforge/contracts";
import type { Plan } from "@ensforge/sdk";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import { decodeCall } from "./decode.js";

/**
 * The approvals the owner gives the HCA so it can move the owner's name tokens: the `.eth`
 * registrar token per id (cleared by the transfer), and NameWrapper for all (left in place).
 */
export const tokenApprovals = (
  calls: readonly Plan.Call[],
  options: {
    readonly owner: Address;
    readonly hca: Address;
    readonly baseRegistrar: Address | undefined;
    readonly nameWrapper: Address | undefined;
  },
): { readonly calls: readonly Plan.Call[]; readonly wrapper: boolean } => {
  const approvals: Plan.Call[] = [];
  let wrapper = false;

  for (const call of calls) {
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

  return { calls: approvals, wrapper };
};
