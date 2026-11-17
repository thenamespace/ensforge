import { Effect, Exit } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import type { Devnet } from "@ensforge/test-devnet";
import type { Client } from "@ensforge/test-integration/support/clients";
import { isAddress, zeroAddress, type Address } from "viem";

import { ensjs, viem, type Reads } from "./libraries.ts";

/** The libraries compared with ensforge. */
export const libraries = ["viem", "ensjs"] as const;
export type Library = (typeof libraries)[number];

/** What one library read: a value, `null`, or that it failed (any error is alike). */
type Outcome = string | null;

/** One read by every library: ensforge first. */
export type Reading = { readonly field: string; readonly ensforge: Outcome } & Record<
  Library,
  Outcome
>;

const settle = (read: Effect.Effect<unknown, unknown, Devnet>) =>
  Effect.map(Effect.exit(read), (exit): Outcome => {
    if (Exit.isFailure(exit)) return "error";
    const value = exit.value;
    if (value === null || value === undefined || value === "" || value === zeroAddress) return null;
    return typeof value === "string" && isAddress(value) ? value.toLowerCase() : String(value);
  });

/** Makes the same read with ensforge (as `ens`), viem and ensjs. */
const readEach = (
  ens: Client,
  field: string,
  read: (reads: Reads) => Effect.Effect<unknown, unknown, Devnet>,
) => {
  const ensforge: Reads = {
    address: (name) => Actions.record.getAddress(ens, { name }),
    text: (name, key) => Actions.record.getText(ens, { name, key }),
    primaryName: (address) => Actions.primaryName.get(ens, { address }),
  };

  return Effect.all(
    { ensforge: settle(read(ensforge)), viem: settle(read(viem)), ensjs: settle(read(ensjs)) },
    { concurrency: "unbounded" },
  ).pipe(Effect.map((outcomes): Reading => ({ field, ...outcomes })));
};

/** The ETH address and `url` text of `name`, as each library reads them. */
export const readName = (ens: Client, name: string) =>
  Effect.all([
    readEach(ens, "address", (reads) => reads.address(name)),
    readEach(ens, "url", (reads) => reads.text(name, "url")),
  ]);

/** The primary name of `address`, as each library reads it. */
export const readPrimary = (ens: Client, address: Address) =>
  readEach(ens, "primary name", (reads) => reads.primaryName(address));

/** The libraries that read differently from ensforge. */
export const disagreeing = (reading: Reading): readonly Library[] =>
  libraries.filter((library) => reading[library] !== reading.ensforge);
