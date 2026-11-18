import { Effect, Schema } from "effect";

import { getAddressRecord, getName, getTextRecord } from "@ensdomains/ensjs/public";
import type { Errors } from "@ensforge/sdk";
import { Devnet, type DevnetClient } from "@ensforge/test-devnet";
import type { Address } from "viem";
import { getEnsAddress, getEnsName, getEnsText } from "viem/actions";

/** A viem or ensjs read that rejected. */
export class LibraryError extends Schema.TaggedError<
  LibraryError,
  { readonly brand: unique symbol }
>()("LibraryError", {
  library: Schema.String,
  cause: Schema.Defect(),
}) {}

/** The ENS reads ensforge is compared on, as one library makes them. */
export type Reads = {
  readonly address: (
    name: string,
  ) => Effect.Effect<unknown, LibraryError | Errors.AnyError, Devnet>;
  readonly text: (
    name: string,
    key: string,
  ) => Effect.Effect<unknown, LibraryError | Errors.AnyError, Devnet>;
  readonly primaryName: (
    address: Address,
  ) => Effect.Effect<unknown, LibraryError | Errors.AnyError, Devnet>;
};

// viem and ensjs are Promise libraries; this is the one place their reads become Effects.
const read = <A>(library: string, request: (client: DevnetClient) => Promise<A>) =>
  Effect.gen(function* () {
    const { client } = yield* Devnet;
    return yield* Effect.tryPromise({
      try: () => request(client),
      catch: (cause) => LibraryError.make({ library, cause }),
    });
  });

/** viem's ENS actions, through the profile's Universal Resolver. */
export const viem: Reads = {
  address: (name) => read("viem", (client) => getEnsAddress(client, { name })),
  text: (name, key) => read("viem", (client) => getEnsText(client, { name, key })),
  primaryName: (address) => read("viem", (client) => getEnsName(client, { address })),
};

/* oxlint-disable typescript/no-unsafe-type-assertion -- ensjs's client type names ENS chains, which the devnet's chain is not */
/** ensjs's public reads. */
export const ensjs: Reads = {
  address: (name) =>
    read("ensjs", (client) =>
      getAddressRecord(client as never, { name }).then((record) => record?.value ?? null),
    ),
  text: (name, key) => read("ensjs", (client) => getTextRecord(client as never, { name, key })),
  primaryName: (address) =>
    read("ensjs", (client) =>
      getName(client as never, { address }).then((result) =>
        result?.match === true ? result.name : null,
      ),
    ),
};
/* oxlint-enable typescript/no-unsafe-type-assertion */
