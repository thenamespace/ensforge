import { Array as Arr, Predicate, Record as Rec, type Effect } from "effect";

/** Every action of an `Actions` tree (the Promise or the Effect one) outside `batch`. */
export const actionsOf = (tree: unknown) => {
  if (!Predicate.isObject(tree)) return [];

  return Arr.flatMap(Rec.toEntries(tree), ([domain, group]) =>
    domain === "batch" || !Predicate.isObject(group)
      ? []
      : Arr.map(Rec.toEntries(group), ([name, action]) => ({
          domain,
          name,
          path: `${domain}.${name}`,
          action,
        })),
  );
};

/** The property `key` of an action (a function carrying `path`, `prepare`, …), if it has one. */
export const propertyOf = (action: unknown, key: string): unknown =>
  Predicate.isObjectKeyword(action) ? Reflect.get(action, key) : undefined;

type Loosely<Result> = ((client: unknown, options: unknown) => Result) & {
  readonly prepare?: (client: unknown, options: unknown) => Result;
};

// A success value of `unknown` would make `expectFailure` and `expectRejection` fail with `unknown`.
type AnyResult = object;

/** An action seen through the `(client, options)` call every action shares. */
export type PromiseAction = Loosely<Promise<AnyResult>>;

export type EffectAction = Loosely<Effect.Effect<AnyResult, { readonly _tag: string }>>;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests that drive every action alike call them with `(client, options)`
export const asPromiseAction = (action: unknown) => action as PromiseAction;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests that drive every action alike call them with `(client, options)`
export const asEffectAction = (action: unknown) => action as EffectAction;
