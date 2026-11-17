import { Abis } from "@ensforge/contracts";
import type { Plan } from "@ensforge/core";
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddressEqual,
  type Abi,
  type Address,
} from "viem";

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
      const decoded = safeDecode(Abis.v1.baseRegistrar as Abi, call.data);
      const [from, , tokenId] = (decoded?.args ?? []) as readonly [Address?, Address?, bigint?];
      if (
        decoded !== undefined &&
        ["safeTransferFrom", "transferFrom"].includes(decoded.functionName) &&
        from !== undefined &&
        tokenId !== undefined &&
        isAddressEqual(from, options.owner)
      ) {
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
      const decoded = safeDecode(Abis.v1.nameWrapper as Abi, call.data);
      const [from] = (decoded?.args ?? []) as readonly [Address?];
      if (
        decoded !== undefined &&
        ["safeTransferFrom", "safeBatchTransferFrom"].includes(decoded.functionName) &&
        from !== undefined &&
        isAddressEqual(from, options.owner)
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

const safeDecode = (abi: Abi, data: `0x${string}`) => {
  try {
    return decodeFunctionData({ abi, data }) as {
      readonly functionName: string;
      readonly args?: readonly unknown[];
    };
  } catch {
    return undefined;
  }
};
