import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { migrationUserRegistrySalt } from "@ensforge/contracts/v2";
import { encodeFunctionData, getAddress, maxUint64, zeroAddress, type Address } from "viem";
import { getCode } from "viem/actions";

import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { callIndexer } from "../indexer/call.js";
import { loadName } from "../name/load.js";
import { deployUserRegistry, rootRoles } from "../registry/deploy.js";
import * as Rpc from "../rpc/index.js";

/** A subname that cannot be recreated, and why. */
export type LeftBehind = { readonly name: string; readonly reason: string };

/** The UserRegistry that recreates a migrating name's direct subnames. */
export type Recreation = {
  readonly registry: Address;
  /** The registry's deployment, when it does not exist yet. */
  readonly deploy: Plan.Call | undefined;
  /** `setParent` and one `register` per subname; they need the registry deployed. */
  readonly calls: readonly Plan.Call[];
  readonly leftBehind: readonly LeftBehind[];
};

const childName = (input: string, parent: string): string =>
  input.includes(".") ? input : `${input}.${parent}`;

/**
 * Plans the UserRegistry for `parent`'s `subnames` (labels or full names): each direct child
 * keeps its ENSv1 holder and resolver, with every role and no expiry, as the ENS app recreates
 * them. Children that cannot move this way (wrapped with fuses, or not on ENSv1) are returned
 * as left behind. The registry address follows the ENS app's salt.
 */
export const planRecreation = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly parent: {
      readonly name: string;
      readonly label: string;
      readonly node: `0x${string}`;
    };
    readonly subnames: readonly string[];
    readonly owner: Address;
    readonly signer: Address;
    readonly parentRegistry: Address;
  },
): Effect.fn.Return<Recreation, AnyError> {
  const { parent } = options;
  const names = options.subnames.map((input) => childName(input.toLowerCase(), parent.name));
  for (const name of names) {
    if (
      name.split(".").length !== parent.name.split(".").length + 1 ||
      !name.endsWith(`.${parent.name}`)
    ) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_NAME",
          input: name,
          field: "subnames",
          shortMessage: `${name} is not a direct subname of ${parent.name}.`,
        }),
      );
    }
  }

  const children = yield* Effect.forEach(names, (name) => loadName(client, name), {
    concurrency: "unbounded",
  });
  const recreate: {
    readonly label: string;
    readonly holder: Address;
    readonly resolver: Address;
  }[] = [];
  const leftBehind: LeftBehind[] = [];
  for (const child of children) {
    const { kind, state, data } = child;
    const fuses = data.v1?.wrapper.fuses ?? 0;
    if (kind !== "v1-unwrapped" && kind !== "v1-wrapped") {
      leftBehind.push({ name: state.name, reason: "not an ENSv1 name" });
    } else if (kind === "v1-wrapped" && fuses !== 0) {
      leftBehind.push({ name: state.name, reason: "wrapped with fuses" });
    } else if (data.parts.encodedLabel || state.owner === null) {
      leftBehind.push({ name: state.name, reason: "unknown label or no owner" });
    } else {
      recreate.push({
        label: data.parts.label,
        holder: getAddress(state.owner),
        resolver: state.resolver ?? zeroAddress,
      });
    }
  }

  const deployment = yield* deployUserRegistry(client, {
    deployer: options.signer,
    owners: [options.owner, options.signer],
    emancipated: false,
    salt: migrationUserRegistrySalt(parent.node),
  });
  const code = yield* Rpc.fromPromise(() =>
    getCode(client.publicClient, { address: deployment.address }),
  );
  const registry = deployment.address;
  const call = (data: `0x${string}`): Plan.Call => ({ to: registry, data, value: 0n });

  return {
    registry,
    deploy: code !== undefined && code !== "0x" ? undefined : deployment.call,
    calls: [
      call(
        encodeFunctionData({
          abi: Abis.v2.userRegistry,
          functionName: "setParent",
          args: [options.parentRegistry, parent.label],
        }),
      ),
      ...recreate.map(({ label, holder, resolver }) =>
        call(
          encodeFunctionData({
            abi: Abis.v2.userRegistry,
            functionName: "register",
            args: [label, holder, zeroAddress, resolver, rootRoles(false), maxUint64],
          }),
        ),
      ),
    ],
    leftBehind,
  };
});

// Recreating more children than this in one migration is better done with an explicit list.
const maxDiscovered = 500;

/**
 * The live direct subnames of `name`, from the client's indexer: `names` can be recreated,
 * `unknown` have labels the indexer only knows by hash. `null` without an indexer or when the
 * indexer does not know the name.
 */
export const discoverSubnames = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<
  { readonly names: readonly string[]; readonly unknown: readonly string[] } | null,
  AnyError
> {
  if (client.config.indexer === undefined) return null;

  const names: string[] = [];
  const unknown: string[] = [];
  let cursor: string | undefined;
  do {
    const page = yield* callIndexer(client, "getSubnames", {
      name,
      namespace: "ens",
      includeExpired: false,
      limit: 200,
      cursor,
    }).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)));
    if (page === null) return null;

    for (const child of page.items) {
      // Lists can include children that no longer exist (unregistered in the ENSv1 registry).
      if (child.status !== "active" && child.status !== null) continue;
      (child.name.includes("[") ? unknown : names).push(child.name);
    }
    if (names.length + unknown.length > maxDiscovered) {
      return yield* Effect.fail(
        new MigrationError({
          code: "NOT_ELIGIBLE",
          blockers: [`more than ${maxDiscovered} subnames`],
          context: { name },
          hint: "Pass the subnames to recreate in `subnames`, or `[]` to leave them behind.",
        }),
      );
    }
    cursor = page.hasMore ? (page.cursor ?? undefined) : undefined;
  } while (cursor !== undefined);

  return { names, unknown };
});
