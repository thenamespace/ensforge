import { Effect } from "effect";
import { Atom, Reactivity } from "effect/reactivity";

import { runtime } from "./runtime.js";

/**
 * The registry's `Reactivity`: the one read atoms subscribe to and writes invalidate.
 *
 * @stability unstable
 */
export const reactivity = runtime.atom(Effect.service(Reactivity.Reactivity)).pipe(Atom.keepAlive);

/**
 * The registry an atom is read in, for writes that run effects against it.
 *
 * @stability unstable
 */
export const currentRegistry = Atom.readable((get) => get.registry);
