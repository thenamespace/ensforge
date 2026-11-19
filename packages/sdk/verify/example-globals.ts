import type { Deployments } from "@ensforge/contracts";
// Free identifiers shared by the JSDoc examples, checked by `ensforge-dev examples`. They stand
// for values the reader's app already has (clients, addresses, plans, UI callbacks).
import type { Actions, Ensforge, Errors, Plan, ensActions } from "@ensforge/sdk";
import type { Indexer } from "@ensforge/sdk/effect";
import type {
  Adapter,
  Indexer as IndexerHandle,
  Subname,
  indexerActions,
} from "@ensforge/sdk/indexer";
import type { Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";
import type { Config as WagmiConfig } from "wagmi";

type NameDraft = Awaited<ReturnType<NonNullable<Adapter["getName"]>>>;

type Callback = (...args: readonly unknown[]) => unknown;

declare global {
  const publicClient: PublicClient;
  const walletClient: WalletClient;
  const wagmiConfig: WagmiConfig;
  const anvil: PublicClient;
  const optimismClient: PublicClient;
  const optimismWallet: WalletClient;
  const baseClient: PublicClient;
  const baseWallet: WalletClient;
  const mainnetRpcUrl: string;
  const baseRpcUrl: string;
  const privateKey: Hex;
  const devnetV2: NonNullable<Parameters<typeof Deployments.define>[0]["v2"]>;
  const request: Parameters<WalletClient["writeContract"]>[0];
  const ens: Ensforge.Client<
    ReturnType<ReturnType<typeof ensActions>> & ReturnType<ReturnType<typeof indexerActions>>
  >;
  const relayer: Ensforge.Client<ReturnType<ReturnType<typeof ensActions>>>;
  const body: string;

  const address: Address;
  const account: Address;
  const bob: Address;
  const owner: Address;
  const operator: Address;
  const delegate: Address;
  const registry: Address;

  const hash: Hex;
  const data: Hex;
  const commitment: Hex;
  const labelhash: Hex;
  const id: string;
  const planId: string;
  const key: string;
  const names: readonly string[];
  const receipts: readonly TransactionReceipt[];
  const authorization: string;
  const error: Errors.EnsforgeError;

  const inHouse: IndexerHandle;
  const fixture: NameDraft;
  const api: {
    name(name: string): Promise<NameDraft>;
    subnames(
      name: string,
      cursor: string | undefined,
      options: { readonly signal?: AbortSignal | undefined },
    ): Promise<{ readonly items: readonly Subname[]; readonly next: string | null }>;
  };

  const recordsPlan: Plan;
  const primaryNamePlan: Plan;

  const tomorrow: Date;
  const inAWeek: Date;
  const inAMonth: Date;

  const onEvents: Actions.event.watch.Options["onEvents"];
  const load: Parameters<typeof Indexer.paginate>[0];
  const toast: Callback;
  const render: Callback;
  const showRenewBanner: Callback;
  const showEditButton: Callback;
  const suggestAlternatives: Callback;
}
