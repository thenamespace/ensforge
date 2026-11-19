import { Effect, Array as Arr } from "effect";

import type { Address } from "viem";

import type {
  NameOperation,
  Operation,
  PermissionCheck,
} from "../../../actions/permission/get/types.js";
import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Fuse from "../../../utils/Fuse.js";
import { l2Client, type L2Location } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";
import { forkContractsOf, forkControl, type ForkControl } from "./fork.js";
import { recordAccess, transferAccess, type RecordAccess } from "./permission.js";

const unknown: PermissionCheck = {
  allowed: null,
  via: null,
  contract: null,
  resource: null,
  missing: [],
};

const blocked = (detail: string, reason: "fuse" | "unsupported", contract: Address | null) =>
  ({
    allowed: false,
    via: null,
    contract,
    resource: null,
    missing: [{ type: "blocked", reason, detail }],
  }) satisfies PermissionCheck;

const fromAccess = (access: RecordAccess): PermissionCheck => ({
  allowed: access.allowed,
  via: access.via,
  contract: access.contract,
  resource: null,
  missing:
    access.allowed || access.contract === null
      ? []
      : [{ type: "owner", contract: access.contract, owner: access.owner }],
});

// The registry operations of ENSv1 forks, and the NameWrapper fuse that blocks each.
const forkOperations: Partial<Record<NameOperation, Fuse.Name | null>> = {
  setResolver: "cannotSetResolver",
  setTtl: "cannotSetTtl",
  createSubname: "cannotCreateSubdomain",
  removeSubname: null,
};

const isFork = (operation: Operation): boolean =>
  typeof operation === "string" && operation in forkOperations;

/**
 * Checks on a name in an L2 namespace, as its contracts authorize them on the L2 (`client` is on
 * the ENS chain): record writes and transfers (which approving the token takes too) on every
 * family, and on Basenames and Linea Names the registry operations of ENSv1, limited by burned
 * NameWrapper fuses. Everything else is unsupported. Unknown (`allowed: null`) when the client
 * cannot reach the L2.
 */
export const checkOnL2: (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
  operations: readonly Operation[],
) => Effect.Effect<readonly PermissionCheck[], AnyError> = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  const l2 = yield* l2Client(client, location, false);
  const fork = l2 === null ? null : forkContractsOf(l2, location);

  // Each access is read once, and only when an operation needs it.
  const accessFor = <A>(
    test: (operation: Operation) => boolean,
    read: (on: Client) => Effect.Effect<A, AnyError>,
  ) => (l2 === null || !Arr.some(operations, test) ? Effect.undefined : read(l2));
  const [records, transfer, control] = yield* Effect.all(
    [
      accessFor(
        (operation) => typeof operation === "object",
        (on) => recordAccess(on, location, parts, account),
      ),
      accessFor(
        (operation) => operation === "transfer",
        (on) => transferAccess(on, location, parts, account),
      ),
      fork === null
        ? Effect.undefined
        : accessFor(
            (operation) => isFork(operation) || operation === "transfer",
            (on): Effect.Effect<ForkControl, AnyError> => forkControl(on, fork, parts, account),
          ),
    ],
    { concurrency: "unbounded" },
  );
  const burned = (fuse: Fuse.Name | null): boolean =>
    fuse !== null && control !== undefined && Fuse.has(control.fuses, fuse);

  return Arr.map(operations, (operation): PermissionCheck => {
    if (l2 === null) return unknown;
    if (typeof operation === "object") return records === undefined ? unknown : fromAccess(records);
    if (operation === "transfer") {
      if (burned("cannotTransfer")) {
        return blocked("The cannotTransfer fuse is burned.", "fuse", control?.contract ?? null);
      }
      return transfer === undefined ? unknown : fromAccess(transfer);
    }

    const fuse = forkOperations[operation];
    if (fuse === undefined || control === undefined) {
      return blocked(
        "ensforge does not make this change to L2 names; their namespace manages it.",
        "unsupported",
        null,
      );
    }
    if (burned(fuse)) return blocked(`The ${fuse} fuse is burned.`, "fuse", control.contract);
    return {
      allowed: control.via !== null,
      via: control.via,
      contract: control.contract,
      resource: null,
      missing:
        control.via === null
          ? [{ type: "owner", contract: control.contract, owner: control.owner }]
          : [],
    };
  });
});
