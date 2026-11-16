/**
 * ERC-165 interface detection.
 *
 * @since 1.0.0
 */
export const erc165Abi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * ERC-165 interface ID of `supportsInterface(bytes4)`.
 *
 * @since 1.0.0
 */
export const erc165InterfaceId = "0x01ffc9a7" as const;
