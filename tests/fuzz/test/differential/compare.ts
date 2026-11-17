import { Effect } from "effect";

import { getAddressRecord, getName, getTextRecord } from "@ensdomains/ensjs/public";
import type { ensforge } from "@ensforge/test-integration/support/chain";
import { isAddress, zeroAddress, type Address, type Client } from "viem";
import { getEnsAddress, getEnsName, getEnsText } from "viem/actions";

/** The libraries compared with ensforge. */
export const libraries = ["viem", "ensjs"] as const;
export type Library = (typeof libraries)[number];

/** What one library read: a value, `null`, or that it failed (any error is alike). */
type Outcome = string | null;

const settle = (read: () => Promise<unknown>): Promise<Outcome> =>
  read().then(
    (value) =>
      value === null || value === undefined || value === "" || value === zeroAddress
        ? null
        : typeof value === "string" && isAddress(value)
          ? value.toLowerCase()
          : String(value),
    () => "error",
  );

/** One read by every library: ensforge first. */
export type Reading = { readonly field: string; readonly ensforge: Outcome } & Record<
  Library,
  Outcome
>;

const read = (
  field: string,
  reads: readonly [() => Promise<unknown>, ...(() => Promise<unknown>)[]],
) =>
  Effect.promise(async (): Promise<Reading> => {
    const [ensforge, viem, ensjs] = await Promise.all(reads.map(settle));
    return { field, ensforge: ensforge ?? null, viem: viem ?? null, ensjs: ensjs ?? null };
  });

/** The ETH address and `url` text of `name`, as each library reads them. */
export const readName = (ens: ReturnType<typeof ensforge>, client: Client, name: string) => {
  const ensClient = client as never;
  return Effect.all([
    read("address", [
      () => ens.record.getAddress({ name }),
      () => getEnsAddress(client, { name }),
      () => getAddressRecord(ensClient, { name }).then((record) => record?.value ?? null),
    ]),
    read("url", [
      () => ens.record.getText({ name, key: "url" }),
      () => getEnsText(client, { name, key: "url" }),
      () => getTextRecord(ensClient, { name, key: "url" }),
    ]),
  ]);
};

/** The primary name of `address`, as each library reads it. */
export const readPrimary = (ens: ReturnType<typeof ensforge>, client: Client, address: Address) =>
  read("primary name", [
    () => ens.primaryName.get({ address }),
    () => getEnsName(client, { address }),
    () =>
      getName(client as never, { address }).then((result) => (result?.match ? result.name : null)),
  ]);

/** The libraries that read differently from ensforge. */
export const disagreeing = (reading: Reading): readonly Library[] =>
  libraries.filter((library) => reading[library] !== reading.ensforge);
