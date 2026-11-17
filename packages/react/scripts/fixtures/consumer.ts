import { AtomRegistry } from "effect/reactivity";

import {
  EnsforgeProvider,
  HydrationBoundary,
  useAddress,
  useRead,
  useRecords,
  useSetRecords,
  useWrite,
  type ReadResult,
} from "@ensforge/react";
import { ensAtom, invalidate } from "@ensforge/react/atoms";
import { dehydrate, prefetch } from "@ensforge/react/server";
// Compiled by scripts/check-dist-types.mjs against the built declarations, as a user would.
import { Actions, Ensforge, type Write } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";
import { Ensforge as WagmiEnsforge } from "@ensforge/sdk/wagmi";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { createConfig } from "wagmi";

const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
});
const wagmiEns = WagmiEnsforge.fromWagmi(
  createConfig({ chains: [mainnet], transports: { [mainnet.id]: http() } }),
);

export const provider = EnsforgeProvider({ client: wagmiEns, children: null });
export const boundary = HydrationBoundary;

export const useProfile = (): ReadResult<string | null, unknown> =>
  useAddress({ name: "nick.eth" });
export const useUrl = () => useRecords({ name: "nick.eth", texts: ["url"] }).data?.texts.url;
export const useRole = () =>
  useRead(EffectActions.role.get, { name: "nick.eth", account: "0x0", target: "registry" });
export const useSave = () => useSetRecords();
export const useSaveSync = (): Promise<Write.SyncResult> =>
  useWrite(Actions.record.setSync).mutateAsync({ name: "alice.eth", texts: { url: "x" } });

const registry = AtomRegistry.make();
export const hasAtom = ensAtom(ens, Actions.name.get, { name: "nick.eth" }) !== undefined;
export const ready: Promise<void> = prefetch(registry, ens, Actions.name.get, { name: "nick.eth" });
export const state = dehydrate(registry, { streaming: true });
invalidate(registry, ens, { names: ["nick.eth"] });
