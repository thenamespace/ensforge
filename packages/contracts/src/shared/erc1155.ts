/**
 * The ERC-1155 ABI, re-exported from viem.
 *
 * @stability stable
 */
export { erc1155Abi } from "viem";

/**
 * `IERC1155Receiver.onERC1155Received`: a contract that receives ERC-1155 tokens (an ENSv2 name)
 * answers it with its own selector, `0xf23a6e61`.
 *
 * @stability stable
 * @since 1.2.0
 */
export const erc1155ReceiverAbi = [
  {
    type: "function",
    name: "onERC1155Received",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "from", type: "address" },
      { name: "id", type: "uint256" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4" }],
  },
] as const;
