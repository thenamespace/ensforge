import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { erc20Abi, hexToBigInt, namehash, parseAbi, type Address } from "viem";

// Raw reads and writes of the devnet's contracts: expectations that do not go through ensforge.

/** A `.eth` name's ENSv2 entry, read from the ETH registry itself. */
export const ethEntry = Effect.fnUntraced(function* (name: string) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const read = { address: devnet.contract("v2.ethRegistry"), abi: Abis.v2.permissionedRegistry };
  const label = Name.parse(name).label;

  return yield* Effect.all({
    owner: chain.read({ ...read, functionName: "findOwner", args: [label] }),
    expiry: chain.read({ ...read, functionName: "findExpiry", args: [label] }),
    tokenId: chain.read({ ...read, functionName: "findTokenId", args: [label] }),
  });
});

/**
 * ENSv1 ownership of `name`: registry owner, registrar token holder (`.eth` 2LDs) and NameWrapper
 * data; `undefined` where the contract reverts (no token, never wrapped).
 */
export const v1Owners = Effect.fnUntraced(function* (name: string) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const node = namehash(name);

  return yield* Effect.all({
    registry: chain.read({
      address: devnet.contract("v1.registry"),
      abi: Abis.v1.ensRegistry,
      functionName: "owner",
      args: [node],
    }),
    registrant: chain
      .read({
        address: devnet.contract("v1.baseRegistrar"),
        abi: Abis.v1.baseRegistrar,
        functionName: "ownerOf",
        args: [Name.toTokenId(name)],
      })
      .pipe(Effect.orElseSucceed(() => undefined)),
    wrapped: chain
      .read({
        address: devnet.contract("v1.nameWrapper"),
        abi: Abis.v1.nameWrapper,
        functionName: "getData",
        args: [hexToBigInt(node)],
      })
      .pipe(Effect.orElseSucceed(() => undefined)),
  });
});

/** `account`'s balance of the devnet's mock USDC. */
export const usdcOf = Effect.fnUntraced(function* (account: Address) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;

  return yield* chain.read({
    address: devnet.contract("v2.usdc"),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
});

/** Mints the devnet's mock USDC to `account`. */
export const mintUsdc = Effect.fnUntraced(function* (account: Address, amount: bigint) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;

  yield* chain.write({
    address: devnet.contract("v2.usdc"),
    abi: parseAbi(["function mint(address to, uint256 amount)"]),
    functionName: "mint",
    args: [account, amount],
    account: devnet.accounts.deployer,
  });
});
