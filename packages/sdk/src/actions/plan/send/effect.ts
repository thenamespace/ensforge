import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { requireSendable } from "../../../internal/plan/records.js";
import type { Write } from "../../../Types.js";
import type { send as Promises } from "./index.js";

/** @internal The planner of `Actions.plan.send`: the given plan, checked against the client. */
export const plan = (client: Client, options: Promises.Options & Pick<Write.Options, "account">) =>
  requireSendable(client, options.plan, addressOf(options.account) ?? client.account);

const write = Action.write("plan.send", plan);

/** @internal Implementation of `Actions.plan.send`. */
export const send = write.send;

/** @internal Implementation of `Actions.plan.sendSync`. */
export const sendSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.plan.send`. */
export const sendMethods = write.methods;
