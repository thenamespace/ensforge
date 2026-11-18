import { Effect, Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  encodePacked,
  getAbiItem,
  isAddressEqual,
  keccak256,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { getBlock, signMessage } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress } from "../../../internal/name/write.js";
import { l2Registrar, requireForwardMatch } from "../../../internal/reverse/l2.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import { chainClient, hasChain } from "../../../internal/write/chain.js";
import { resolveSigner } from "../../../internal/write/signer.js";
import * as CoinType from "../../../utils/CoinType.js";
import type { signClaim as Promises } from "./index.js";

// The registrar rejects signatures that expire more than an hour after its block time.
const maxExpiresIn = 3600n;

const selectorOf = (name: "setNameForAddrWithSignature" | "setNameForOwnableWithSignature") =>
  toFunctionSelector(getAbiItem({ abi: Abis.v1.l2ReverseRegistrar, name }));

/**
 * The message `L2ReverseRegistrar` checks the signature against (before EIP-191 prefixing): the
 * registrar, the function, the account, the expiry, the name and the coin types, packed.
 */
export const claimMessage = (claim: Promises.Claim): Hex => {
  const coinTypes = Arr.map(claim.chainIds, CoinType.fromChainId);
  const expiry = BigInt(claim.expiry);
  return keccak256(
    claim.owner === undefined
      ? encodePacked(
          ["address", "bytes4", "address", "uint256", "string", "uint256[]"],
          [
            claim.registrar,
            selectorOf("setNameForAddrWithSignature"),
            claim.address,
            expiry,
            claim.name,
            coinTypes,
          ],
        )
      : encodePacked(
          ["address", "bytes4", "address", "address", "uint256", "string", "uint256[]"],
          [
            claim.registrar,
            selectorOf("setNameForOwnableWithSignature"),
            claim.address,
            claim.owner,
            expiry,
            claim.name,
            coinTypes,
          ],
        ),
  );
};

const invalidChains = (input: unknown, shortMessage: string) =>
  new InvalidInputError({ code: "INVALID_COIN_TYPE", field: "chainIds", input, shortMessage });

/** @internal Implementation of `Actions.primaryName.signClaim`. */
export const signClaim = Effect.fn("ensforge.primaryName.signClaim")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const { chainIds } = options;
  if (chainIds.length === 0) {
    return yield* Effect.fail(invalidChains(chainIds, "A claim needs at least one chain."));
  }
  if (chainIds.includes(client.chain.id)) {
    return yield* Effect.fail(
      invalidChains(
        chainIds,
        `Chain ${client.chain.id} is the ENS chain; set its primary name with \`primaryName.set\`.`,
      ),
    );
  }
  const registrars = yield* Effect.forEach(chainIds, l2Registrar, { concurrency: 1 });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
  const registrar = registrars[0] as Address;
  if (Arr.some(registrars, (other) => !isAddressEqual(other, registrar))) {
    return yield* Effect.fail(
      invalidChains(
        chainIds,
        "The chains have different reverse registrars; sign one claim for mainnet L2s and another for testnets.",
      ),
    );
  }

  const expiresIn = options.expiresIn ?? maxExpiresIn;
  if (expiresIn <= 0n || expiresIn > maxExpiresIn) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_DURATION",
        field: "expiresIn",
        input: expiresIn,
        shortMessage: "A claim must expire within one hour (3600 seconds).",
      }),
    );
  }

  const name = options.name === null ? "" : yield* normalizeName(options.name);
  if (Str.includes("[")(name)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: options.name,
        shortMessage: "A primary name needs its plain labels, not their hashes.",
      }),
    );
  }

  const signer = yield* resolveSigner(client, options.account);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a resolved signer has an account
  const signerAddress = addressOf(signer.account) as Address;
  const address =
    options.address === undefined
      ? signerAddress
      : yield* requireAddress(options.address, "address");

  if (name !== "" && options.verify !== false) {
    yield* requireForwardMatch(client, name, address, Arr.map(chainIds, CoinType.fromChainId));
  }

  // Counted from the earliest clock among the chains, so the claim is valid on each of them; a
  // chain without its own clients counts from the ENS chain's.
  const timestamps = yield* Effect.forEach(
    chainIds,
    (chainId) =>
      (hasChain(client, chainId) ? chainClient(client, chainId) : Effect.succeed(client)).pipe(
        Effect.flatMap((target) =>
          fromPromise(() => getBlock(target.publicClient, { blockTag: "latest" })),
        ),
        Effect.map((block) => block.timestamp),
      ),
    { concurrency: 1 },
  );
  const now = Arr.reduce(timestamps, timestamps[0] ?? 0n, (earliest, timestamp) =>
    timestamp < earliest ? timestamp : earliest,
  );

  const claim: Promises.Claim = {
    registrar,
    address,
    ...(isAddressEqual(address, signerAddress) ? {} : { owner: signerAddress }),
    name,
    chainIds: [...chainIds],
    expiry: Number(now + expiresIn),
  };
  const signature = yield* fromPromise(() =>
    signMessage(signer.walletClient, {
      account: signer.account,
      message: { raw: claimMessage(claim) },
    }),
  );

  return { claim, signature };
}, Action.withContext("primaryName.signClaim"));
