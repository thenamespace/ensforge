import { Effect, Predicate } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { loadName } from "../name/load.js";
import { requireAddress } from "../name/write.js";

/** A registry given directly, or as the subregistry of a name (the registry of its children). */
export type RegistryTarget = { readonly name: string } | { readonly registry: string };

/** The registry address of a target; `undefined` when the name has no subregistry. */
export const findTargetRegistry = (
  client: Client,
  target: RegistryTarget,
  block: Read.BlockOptions = {},
): Effect.Effect<Address | undefined, AnyError> =>
  "registry" in target
    ? requireAddress(target.registry, "registry")
    : loadName(client, target.name, block).pipe(
        Effect.map(({ state }) => state.subregistry ?? undefined),
      );

/** Like {@link findTargetRegistry}, failing with `REGISTRY_NOT_FOUND` when there is none. */
export const requireTargetRegistry = (
  client: Client,
  target: RegistryTarget,
): Effect.Effect<Address, AnyError> =>
  findTargetRegistry(client, target).pipe(
    Effect.filterOrFail(
      Predicate.isNotUndefined,
      () =>
        new NotFoundError({
          code: "REGISTRY_NOT_FOUND",
          hint: "Create one with registry.deploy, or subname.create deploys it with the first subname.",
        }),
    ),
  );
