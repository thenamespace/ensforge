// Free identifiers shared by the JSDoc examples, checked by scripts/check-examples.mjs. They stand
// for values the reader's app already has (clients, keys, sessions, an API client).
import type {
  Executor,
  HcaSession,
  RhinestoneSdk,
  hcaActions,
  hcaAdminActions,
} from "@ensforge/hca";
import type { Ensforge, Plan, Write, ensActions } from "@ensforge/sdk";
import type { Address, Hex, LocalAccount, PublicClient, WalletClient } from "viem";

declare global {
  const publicClient: PublicClient;
  const walletClient: WalletClient;
  const ens: Ensforge.Client<
    ReturnType<ReturnType<typeof ensActions>> &
      ReturnType<ReturnType<typeof hcaActions>> &
      ReturnType<ReturnType<typeof hcaAdminActions>>
  >;

  const address: Address;
  const account: Address;
  const grantee: Address;
  const newOwner: Address;
  const implementation: Address;
  const resolver: Address;
  const hash: Hex;
  const roles: bigint;
  const amount: bigint;
  const duration: bigint;
  const validUntil: number;
  const names: readonly string[];
  const url: string;
  const apiKey: string;
  const bundlerUrl: string;
  const paymasterUrl: string;

  const via: Write.Via;
  const calls: readonly Plan.Call[];
  const session: HcaSession;
  const sessionAccount: LocalAccount;
  const sessionSigner: LocalAccount;
  const sdk: RhinestoneSdk;
  const capabilities: Executor["capabilities"];
  const relayer: Executor;
  const api: {
    relay(request: Parameters<NonNullable<Executor["send"]>>[0]): Promise<string>;
    status(id: string): Promise<Awaited<ReturnType<NonNullable<Executor["status"]>>>>;
  };
}
