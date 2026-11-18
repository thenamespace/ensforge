import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../../errors/types.js";
import { addressOf } from "../../../internal/address.js";
import { requireAddress } from "../../../internal/name/write.js";
import { primaryNameCoinType } from "../../../internal/reverse/coin.js";
import { l2Registrar, requireForwardMatch } from "../../../internal/reverse/l2.js";
import { chainClient } from "../../../internal/write/chain.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as CoinType from "../../../utils/CoinType.js";
import type { set as Promises } from "./index.js";

type ClaimOptions = Extract<Promises.Options, { readonly claim: object }>;

const onePlan = (chainId: number, account: Address | undefined, name: string, call: Plan.Call) =>
  makePlan({
    operation: "primaryName.set",
    chainId,
    account,
    steps: [
      {
        id: "write",
        description: name === "" ? "Clear primary name" : "Set primary name",
        calls: [call],
      },
    ],
  });

/**
 * The primary name of the signer, or of a contract it owns (`Ownable`), on an L2: one call to
 * that chain's reverse registrar, sent there by the signer.
 */
export const l2Plan = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly address?: string | undefined; readonly verify?: boolean | undefined } & Pick<
    Write.Options,
    "account"
  >,
  chainId: number,
  name: string,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined)
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  const target =
    options.address === undefined ? signer : yield* requireAddress(options.address, "address");
  const registrar = yield* l2Registrar(chainId);
  yield* chainClient(client, chainId);

  if (name !== "" && options.verify !== false) {
    yield* requireForwardMatch(client, name, target, [CoinType.fromChainId(chainId)]);
  }

  const data = isAddressEqual(target, signer)
    ? encodeFunctionData({
        abi: Abis.v1.l2ReverseRegistrar,
        functionName: "setName",
        args: [name],
      })
    : encodeFunctionData({
        abi: Abis.v1.l2ReverseRegistrar,
        functionName: "setNameForAddr",
        args: [target, name],
      });
  return onePlan(chainId, signer, name, { to: registrar, data, value: 0n });
});

/** Submits a claim from `primaryName.signClaim` on one of its chains, sent by any account. */
export const claimPlan = Effect.fnUntraced(function* (
  client: Client,
  options: ClaimOptions & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const { claim, signature } = options;
  const coinTypes = claim.chainIds.map(CoinType.fromChainId);

  let chainId = claim.chainIds.length === 1 ? claim.chainIds[0] : undefined;
  if (options.coin !== undefined) {
    const coinType = yield* primaryNameCoinType(options.coin);
    chainId = CoinType.toChainId(coinType) ?? undefined;
    if (!coinTypes.includes(coinType)) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_COIN_TYPE",
          input: options.coin,
          field: "coin",
          shortMessage: "The claim does not cover this chain.",
          hint: `The claim covers chains ${claim.chainIds.join(", ")}; sign one that includes this chain.`,
        }),
      );
    }
  }
  if (chainId === undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_COIN_TYPE",
        field: "coin",
        shortMessage: "The claim covers several chains; pass `coin` to choose one.",
      }),
    );
  }

  // The registrar's address is part of the signed message, so another registrar rejects it.
  const registrar = yield* l2Registrar(chainId);
  yield* chainClient(client, chainId);
  if (!isAddressEqual(registrar, claim.registrar)) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "SIGNATURE_INVALID",
        shortMessage: `The claim was signed for the reverse registrar ${claim.registrar}, not chain ${chainId}'s.`,
      }),
    );
  }

  if (claim.name !== "" && options.verify !== false) {
    yield* requireForwardMatch(client, claim.name, claim.address, [CoinType.fromChainId(chainId)]);
  }

  const expiry = BigInt(claim.expiry);
  const data =
    claim.owner === undefined
      ? encodeFunctionData({
          abi: Abis.v1.l2ReverseRegistrar,
          functionName: "setNameForAddrWithSignature",
          args: [claim.address, expiry, claim.name, coinTypes, signature],
        })
      : encodeFunctionData({
          abi: Abis.v1.l2ReverseRegistrar,
          functionName: "setNameForOwnableWithSignature",
          args: [claim.address, claim.owner, expiry, claim.name, coinTypes, signature],
        });
  return onePlan(chainId, addressOf(options.account) ?? client.account, claim.name, {
    to: registrar,
    data,
    value: 0n,
  });
});
