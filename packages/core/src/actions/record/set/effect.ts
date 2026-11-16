import { Effect } from "effect";

import { multicallResolverAbi } from "@ensforge/contracts/shared";
import { encodeFunctionData, parseAbi, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import { namehash } from "../../../utils/Name.js";
import type { set as Promises } from "./index.js";

// The text-record setter shared by every ENS resolver with the text profile.
const setTextAbi = /* @__PURE__ */ parseAbi([
  "function setText(bytes32 node, string key, string value)",
]);

const encodeTexts = (node: Hex, texts: Promises.Options["texts"]): readonly Hex[] =>
  Object.entries(texts).map(([key, value]) =>
    encodeFunctionData({
      abi: setTextAbi,
      functionName: "setText",
      args: [node, key, value ?? ""],
    }),
  );

/** @internal Builds the plan of `Actions.record.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const name = yield* normalizeName(options.name);
  const updates = encodeTexts(namehash(name), options.texts);
  if (updates.length === 0) {
    return yield* Effect.fail(
      new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "texts", input: options.texts }),
    );
  }

  const resolver = yield* Rpc.findResolver(client, { name });
  // A wildcard (inherited) resolver belongs to a parent; writing to it would change the parent.
  if (resolver === null || resolver.inherited) {
    return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
  }

  const data =
    updates.length === 1
      ? (updates[0] as Hex)
      : encodeFunctionData({
          abi: multicallResolverAbi,
          functionName: "multicall",
          args: [updates],
        });

  return makePlan({
    operation: "record.set",
    chainId: client.chain.id,
    account: addressOf(options.account) ?? client.account,
    steps: [
      { id: "set", description: "Set records", calls: [{ to: resolver.address, data, value: 0n }] },
    ],
  });
});

const write = Action.write("record.set", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.record.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.record.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.record.set`. */
export const setMethods = write.methods;
