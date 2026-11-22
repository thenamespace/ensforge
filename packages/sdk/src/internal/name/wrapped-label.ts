import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { dnsDecode } from "../../utils/Name.js";
import * as Rpc from "../rpc/index.js";
import { parseName } from "./normalize.js";

/**
 * The full name of a wrapped `[labelhash]` name, from the NameWrapper's own record of it; `null`
 * when it was never wrapped (the label stays unknown).
 */
export const wrappedName = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<string | null, AnyError> {
  const nameWrapper = client.deployment.v1?.contracts.nameWrapper;
  if (nameWrapper === undefined) return null;

  const { node } = yield* parseName(name);
  const dns = yield* Rpc.readContractOrUndefined(client, {
    address: nameWrapper,
    abi: Abis.v1.nameWrapper,
    functionName: "names",
    args: [node],
  });
  return dns === undefined || dns === "0x" ? null : dnsDecode(dns);
});
