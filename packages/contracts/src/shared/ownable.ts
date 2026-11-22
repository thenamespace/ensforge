/**
 * `Ownable.owner()`: the account that controls a contract, as the L2 reverse registrars check
 * before letting it name the contract.
 *
 * @stability stable
 * @since 1.2.0
 */
export const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
