import { Effect, Array as Arr, String as Str } from "effect";

import { labelhash as labelhashOf, zeroAddress, type Address } from "viem";

import type { NameOperation, PermissionCheck } from "../../actions/permission/get/types.js";
import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as V1Calls from "../name/v1-calls.js";
import { wrappedName } from "../name/wrapped-label.js";
import { requireV1Contracts } from "../name/write.js";
import { checkLoaded, explainDenied } from "../permission/check.js";
import { evaluateChildRewrite, evaluateSelfRemoval } from "../permission/evaluate.js";
import { readPermissionFacts } from "../permission/facts.js";
import type { LoadedSubname } from "./load.js";

/** The calls of an ENSv1 subname write, and what they leave behind. */
export type V1Route = {
  readonly calls: readonly Plan.Call[];
  readonly warnings: readonly Plan.Warning[];
};

const usable = (check: PermissionCheck | undefined): check is PermissionCheck =>
  check !== undefined && check.allowed !== false;

const stranded: Plan.Warning = {
  code: "WRAPPER_TOKEN_STRANDED",
  message:
    "The child's NameWrapper token stays with its holder but no longer controls the name: the registry record is rewritten from the unwrapped parent.",
};

/**
 * The label NameWrapper calls take, which they hash again: an encoded `[labelhash]` label is
 * recovered from the NameWrapper's record of the child, else `undefined`.
 */
const wrapperLabel = Effect.fnUntraced(function* (
  client: Client,
  { child, label }: LoadedSubname,
): Effect.fn.Return<string | undefined, AnyError> {
  if (!child.data.parts.encodedLabel) return label;
  const name = yield* wrappedName(client, child.data.parts.name);
  const recovered = name === null ? undefined : Str.split(".")(name)[0];
  return recovered !== undefined && labelhashOf(recovered) === child.data.parts.labelhash
    ? recovered
    : undefined;
});

const unknownLabel = (subname: LoadedSubname) =>
  new InvalidInputError({
    code: "INVALID_NAME",
    input: subname.child.data.parts.name,
    shortMessage: "The NameWrapper needs this subname's label, which is known only by its hash.",
  });

/** The account's authority over the parent's children, and over the child as its holder. */
const authorities = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  signer: Address,
) {
  const contracts = client.deployment.v1?.contracts;
  const facts = yield* Effect.all(
    {
      parent:
        subname.route === "v2"
          ? Effect.undefined
          : readPermissionFacts(client, subname.parent, signer, []),
      child: readPermissionFacts(client, subname.child, signer, []),
    },
    { concurrency: "unbounded" },
  );
  return {
    viaParent:
      facts.parent === undefined
        ? undefined
        : evaluateChildRewrite(facts.parent, subname.child, contracts),
    removeViaChild: evaluateSelfRemoval(facts.child, contracts),
  };
});

/** The account has the authority a denied check needs, and something else blocks it. */
const authorized = (check: PermissionCheck): boolean =>
  Arr.every(check.missing, (requirement) => requirement.type === "blocked");

/**
 * Refuses the write, naming the route the account has authority on (blocked by a fuse or the
 * name's status), else the first one: the parent's.
 */
const refused = (
  checks: readonly (PermissionCheck | undefined)[],
  signer: Address,
): Effect.Effect<never, AnyError> => {
  const denied = Arr.filter(checks, (check) => check !== undefined);
  return Effect.fail(
    explainDenied(
      [...Arr.filter(denied, authorized), ...Arr.filter(denied, (check) => !authorized(check))],
      signer,
    ) ?? new UnauthorizedError({ code: "NOT_OWNER", account: signer }),
  );
};

/**
 * How an ENSv1 subname is removed, in order of preference: one call from the parent; the child's
 * holder clearing it; from a wrapped parent, wrapping the child to the signer and then clearing
 * it (the NameWrapper only zeroes children it holds); from an unwrapped parent, clearing a
 * wrapped child in the registry, which strands its token. Refused before signing otherwise.
 */
export const removeRoute = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  signer: Address,
): Effect.fn.Return<V1Route, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { parent, child, route } = subname;
  const { node, labelhash } = child.data.parts;
  const parentNode = parent.data.parts.node;
  const { viaParent, removeViaChild } = yield* authorities(client, subname, signer);
  const wrapped = child.state.wrapped;
  const held = wrapped && child.state.owner !== null;
  const label = route === "v1-wrapped" ? yield* wrapperLabel(client, subname) : subname.label;
  const cleared = {
    parentNode,
    label: label ?? "",
    labelhash,
    owner: zeroAddress,
    resolver: zeroAddress,
  };
  const throughParent = usable(viaParent);

  if (throughParent && route === "v1" && !wrapped) {
    return { calls: [V1Calls.setSubnodeRecord(contracts.registry, false, cleared)], warnings: [] };
  }
  if (throughParent && route === "v1-wrapped" && held && label !== undefined) {
    return {
      calls: [V1Calls.setSubnodeRecord(contracts.nameWrapper, true, cleared)],
      warnings: [],
    };
  }
  if (usable(removeViaChild)) {
    return {
      calls: [V1Calls.clearRecord(wrapped ? contracts.nameWrapper : contracts.registry, node)],
      warnings: [],
    };
  }
  if (throughParent && route === "v1-wrapped" && label !== undefined) {
    return {
      calls: [
        V1Calls.setSubnodeOwner(contracts.nameWrapper, true, { ...cleared, owner: signer }),
        V1Calls.setSubnodeRecord(contracts.nameWrapper, true, cleared),
      ],
      warnings: [],
    };
  }
  if (throughParent && route === "v1") {
    return {
      calls: [V1Calls.setSubnodeRecord(contracts.registry, false, cleared)],
      warnings: [stranded],
    };
  }
  if (throughParent && label === undefined) return yield* Effect.fail(unknownLabel(subname));
  return yield* refused([viaParent, removeViaChild], signer);
});

/** Changes to an ENSv1 subname; whatever is left out keeps its current value. */
export type V1Changes = {
  readonly owner: Address | undefined;
  readonly resolver: Address | undefined;
  readonly expiry: bigint | undefined;
};

/**
 * How an ENSv1 subname is updated, in order of preference: one call from the parent (an
 * unwrapped parent keeps a wrapped child's registry owner, the NameWrapper, so its token keeps
 * control); the child's holder, change by change; from an unwrapped parent, giving a wrapped
 * child a new registry owner, which strands its token. Refused before signing otherwise.
 */
export const updateRoute = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  signer: Address,
  changes: V1Changes,
): Effect.fn.Return<V1Route, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { parent, child, route } = subname;
  const { state, data } = child;
  const { node, labelhash } = data.parts;
  const parentNode = parent.data.parts.node;
  const { viaParent } = yield* authorities(client, subname, signer);
  const wrapped = state.wrapped;
  const registryOwner = data.v1?.registryOwner ?? zeroAddress;
  const resolver = changes.resolver ?? state.resolver ?? zeroAddress;
  const ttl = state.ttl ?? 0n;
  const record = changes.owner !== undefined || changes.resolver !== undefined;
  const throughParent = usable(viaParent);
  const noExpiryUnwrapped = new UnsupportedError({
    code: "UNSUPPORTED_PROTOCOL",
    protocol: "v1",
    feature: "expiry of unwrapped ENSv1 subnames",
  });

  if (throughParent && route === "v1" && !wrapped) {
    if (changes.expiry !== undefined) return yield* Effect.fail(noExpiryUnwrapped);
    return {
      calls: [
        V1Calls.setSubnodeRecord(contracts.registry, false, {
          parentNode,
          label: subname.label,
          labelhash,
          owner: changes.owner ?? registryOwner,
          resolver,
          ttl,
        }),
      ],
      warnings: [],
    };
  }
  // The registry owner of a wrapped child is the NameWrapper: keeping it keeps the token valid.
  if (
    throughParent &&
    route === "v1" &&
    changes.owner === undefined &&
    changes.expiry === undefined
  ) {
    return {
      calls: [
        V1Calls.setSubnodeRecord(contracts.registry, false, {
          parentNode,
          label: subname.label,
          labelhash,
          owner: registryOwner,
          resolver,
          ttl,
        }),
      ],
      warnings: [],
    };
  }
  if (throughParent && route === "v1-wrapped" && wrapped) {
    if (!record && changes.expiry !== undefined) {
      return {
        calls: [V1Calls.extendExpiry(contracts.nameWrapper, parentNode, labelhash, changes.expiry)],
        warnings: [],
      };
    }
    const label = yield* wrapperLabel(client, subname);
    if (label === undefined) return yield* Effect.fail(unknownLabel(subname));
    return {
      calls: [
        V1Calls.setSubnodeRecord(contracts.nameWrapper, true, {
          parentNode,
          label,
          labelhash,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a held wrapped child has an owner; an ownerless one is refused before routing
          owner: changes.owner ?? (state.owner as Address),
          resolver,
          ttl,
          expiry: changes.expiry ?? state.expiry ?? 0n,
        }),
      ],
      warnings: [],
    };
  }

  // The child's holder makes each change itself; the owner goes last, as it gives up authority.
  const operations: NameOperation[] = [
    ...(changes.resolver === undefined ? [] : ["setResolver" as const]),
    ...(changes.expiry === undefined ? [] : ["renew" as const]),
    ...(changes.owner === undefined ? [] : ["transfer" as const]),
  ];
  const holderChecks = yield* checkLoaded(client, child, signer, operations);
  if (Arr.every(holderChecks, usable)) {
    if (!wrapped && changes.expiry !== undefined) return yield* Effect.fail(noExpiryUnwrapped);
    const to = wrapped ? contracts.nameWrapper : contracts.registry;
    return {
      calls: [
        ...(changes.resolver === undefined
          ? []
          : [V1Calls.setResolver(to, node, changes.resolver)]),
        ...(changes.expiry === undefined
          ? []
          : [V1Calls.extendExpiry(contracts.nameWrapper, parentNode, labelhash, changes.expiry)]),
        ...(changes.owner === undefined
          ? []
          : [
              wrapped
                ? // The checks above found the holder; the signer stands in for an unknown one.
                  V1Calls.transferWrapped(
                    contracts.nameWrapper,
                    state.owner ?? signer,
                    changes.owner,
                    node,
                  )
                : V1Calls.setOwner(contracts.registry, node, changes.owner),
            ]),
      ],
      warnings: [],
    };
  }

  if (throughParent && route === "v1" && changes.expiry === undefined) {
    return {
      calls: [
        V1Calls.setSubnodeRecord(contracts.registry, false, {
          parentNode,
          label: subname.label,
          labelhash,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this route is taken only to change the owner
          owner: changes.owner as Address,
          resolver,
          ttl,
        }),
      ],
      warnings: [stranded],
    };
  }
  // The NameWrapper rewrites only children it holds; an unwrapped one is its holder's to change.
  if (throughParent && route === "v1-wrapped" && !wrapped) {
    return yield* Effect.fail(
      new NameStateError({
        code: "NAME_NOT_WRAPPED",
        shortMessage: `${data.parts.name} is not wrapped, so its wrapped parent cannot change it.`,
        hint: "Change it as its registry owner, or remove it and create it again from the parent.",
      }),
    );
  }
  return yield* refused([viaParent, ...holderChecks], signer);
});
