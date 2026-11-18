import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeAbiParameters, encodeFunctionData, hexToBigInt, zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { fuseMask } from "../../../internal/wrapper/fuses.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Fuse from "../../../utils/Fuse.js";
import type { wrap as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.wrapper.wrap`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "the NameWrapper");

  const { state, data } = loaded;
  const { parts } = data;
  const contracts = yield* requireV1Contracts(client);
  if (state.wrapped) return yield* Effect.fail(new NameStateError({ code: "NAME_WRAPPED" }));
  if (parts.encodedLabel) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: parts.name,
        shortMessage: "Wrapping needs the plain label, not its hash.",
      }),
    );
  }
  if (options.fuses !== undefined && !parts.isEth2ld) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "fuses",
        shortMessage: "Only .eth second-level names burn fuses when wrapped.",
      }),
    );
  }

  const signer = addressOf(options.account) ?? client.account;
  const owner = yield* requireAddress(options.owner ?? signer ?? state.owner ?? "", "owner");
  // A zero resolver keeps the name's current one.
  const resolver =
    options.resolver === undefined
      ? zeroAddress
      : yield* requireAddress(options.resolver, "resolver");
  const operation = "wrapper.wrap";
  const chainId = client.chain.id;

  if (parts.isEth2ld) {
    // The NameWrapper wraps a registrar token sent to it with the wrapping data, in one call.
    const fuses = yield* fuseMask(options.fuses ?? [], Fuse.from(["parentCannotControl"]), "owner");
    const call = {
      to: contracts.baseRegistrar,
      data: encodeFunctionData({
        abi: Abis.v1.baseRegistrar,
        functionName: "safeTransferFrom",
        args: [
          state.registrant ?? owner,
          contracts.nameWrapper,
          hexToBigInt(parts.labelhash),
          encodeAbiParameters(
            [{ type: "string" }, { type: "address" }, { type: "uint16" }, { type: "address" }],
            [parts.label, owner, fuses, resolver],
          ),
        ],
      }),
      value: 0n,
    };
    return makePlan({
      operation,
      chainId,
      account: signer,
      steps: [{ id: "wrap", description: "Wrap name", calls: [call] }],
    });
  }

  // Other names: the NameWrapper takes over the registry entry, so the manager approves it first.
  const manager = state.manager ?? owner;
  const approved = yield* Rpc.readContract(client, {
    address: contracts.registry,
    abi: Abis.v1.ensRegistry,
    functionName: "isApprovedForAll",
    args: [manager, contracts.nameWrapper],
  });
  const steps: Plan.Step[] = [];
  if (!approved) {
    steps.push({
      id: "approve",
      description: "Approve the NameWrapper",
      calls: [
        {
          to: contracts.registry,
          data: encodeFunctionData({
            abi: Abis.v1.ensRegistry,
            functionName: "setApprovalForAll",
            args: [contracts.nameWrapper, true],
          }),
          value: 0n,
        },
      ],
    });
  }
  steps.push({
    id: "wrap",
    description: "Wrap name",
    calls: [
      {
        to: contracts.nameWrapper,
        data: encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "wrap",
          args: [parts.dns, owner, resolver],
        }),
        value: 0n,
      },
    ],
  });

  return makePlan({ operation, chainId, account: signer, steps });
});

const write = Action.write(
  "wrapper.wrap",
  plan,
  { contractKind: "wrapper" },
  explainFor(
    (options) => options.name,
    () => ["transfer" as const],
  ),
);

/** @internal Implementation of `Actions.wrapper.wrap`. */
export const wrap = write.send;

/** @internal Implementation of `Actions.wrapper.wrapSync`. */
export const wrapSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.wrapper.wrap`. */
export const wrapMethods = write.methods;
