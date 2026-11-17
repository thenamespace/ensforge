import { custom, type EIP1193RequestFn, type Hex } from "viem";

/** One recorded JSON-RPC request. */
export type RecordedCall = { readonly method: string; readonly params: unknown };

/** Answers JSON-RPC requests in tests; unhandled requests fail the test loudly. */
export type Script = (request: {
  readonly method: string;
  readonly params: readonly unknown[];
}) => unknown;

/**
 * A viem transport that answers from `script` and records every request, so tests can assert
 * results and RPC budgets without a chain.
 */
export const scriptedTransport = (script: Script) => {
  const calls: RecordedCall[] = [];
  const request = (async ({ method, params }: { method: string; params?: unknown }) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return "0x1" as Hex;
    const answer = script({ method, params: (params ?? []) as readonly unknown[] });
    if (answer === undefined) throw new Error(`Unscripted RPC request: ${method}`);
    return answer;
  }) as EIP1193RequestFn;
  return { transport: custom({ request }), calls };
};

/** A script that fails on any request: for tests that must not touch the chain. */
export const noRpc: Script = ({ method }) => {
  throw new Error(`Unexpected RPC request: ${method}`);
};
