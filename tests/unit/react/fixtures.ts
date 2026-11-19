import type { Effect } from "effect";

import { Ensforge } from "@ensforge/sdk";
import { noRpc, scriptedTransport } from "@ensforge/test-harness";
import { mainnet } from "viem/chains";

/** A mainnet client that fails on any RPC call: actions under test are fakes. */
export const client = (
  options: Omit<Ensforge.CreateOptions, "chain" | "transports" | "publicRpc"> = {},
): Ensforge.Client =>
  Ensforge.create({
    ...options,
    chain: mainnet,
    transports: { [mainnet.id]: scriptedTransport(noRpc).transport },
    publicRpc: false,
  });

/** A fake read action: records its calls and resolves with `answer(options)`. */
export const fakeRead = <options, value>(
  path: string,
  answer: (options: options) => value | Promise<value>,
) => {
  const calls: { readonly options: options; readonly signal: AbortSignal | undefined }[] = [];
  const action = Object.assign(
    // oxlint-disable-next-line effecttsgo/async-function -- a fake Promise-API action
    async (_client: Ensforge.Client, options: options & { readonly signal?: AbortSignal }) => {
      calls.push({ options, signal: options.signal });
      return await answer(options);
    },
    { path },
  );
  return { action, calls };
};

/** A fake Effect read action. */
export const fakeEffectRead = <options, value, error = never>(
  path: string,
  answer: (options: options) => Effect.Effect<value, error>,
) => Object.assign((_client: Ensforge.Client, options: options) => answer(options), { path });
