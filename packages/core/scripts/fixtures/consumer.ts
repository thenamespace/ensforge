// Compiled by scripts/check-dist-types.mjs against the built declarations, as a user would.
import { Actions, Ensforge, Errors, Name, ensActions, type Plan, type Write } from "@ensforge/core";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const ens = Ensforge.create({ publicClient, simulate: true }).extend(ensActions());

export const url: Promise<string | null> = ens.record.getText({ name: "nick.eth", key: "url" });
export const standalone: Promise<string | null> = Actions.record.getText(publicClient, {
  name: "nick.eth",
  key: "url",
  blockTag: "safe",
});
export const plan: Promise<Plan> = ens.record.set.prepare({
  name: "alice.eth",
  texts: { url: null },
});
export const write: Promise<Write.Result> = Actions.record.set(ens, {
  name: "alice.eth",
  texts: { url: "x" },
  mode: "auto",
});
export const request = Actions.record.getText.request({ name: "nick.eth", key: "url" });
export const node: `0x${string}` = Name.namehash("nick.eth");

export const handle = (error: unknown): string => {
  if (Errors.hasCode("MISSING_ROLES")(error)) return error.missingRoles.join(", ");
  if (error instanceof Errors.CommitmentError && error.code === "COMMITMENT_TOO_NEW")
    return String(error.readyAt);
  return Errors.describe(error).title;
};

export const both = Actions.record.getText(publicClient, {
  name: "a.eth",
  key: "url",
  blockNumber: 1n,
  // @ts-expect-error blockNumber and blockTag are exclusive
  blockTag: "latest",
});

// @ts-expect-error only extended domains exist
export const missing = Ensforge.create({ publicClient }).record;
