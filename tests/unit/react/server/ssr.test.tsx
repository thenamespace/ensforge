// @vitest-environment node
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";

import { RegistryProvider } from "@effect/atom-react";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { AsyncResult, AtomRegistry, Hydration } from "effect/reactivity";

import {
  EnsforgeProvider,
  HydrationBoundary,
  useInfiniteRead,
  useRead,
  useSuspenseRead,
} from "@ensforge/react";
import { ensAtom } from "@ensforge/react/atoms";
import { dehydrate, prefetch } from "@ensforge/react/server";

import { client, fakeEffectRead, fakeRead } from "../fixtures.js";

const profile = { name: "nick.eth", expiry: 1_700_000_000n, hash: new Uint8Array([1, 2, 255]) };

// `prefetch` is a Promise API for server code; it has no Effect counterpart.
describe("prefetch and dehydrate", () => {
  it.effect("sends prefetched values to another registry, bigints and bytes included", () =>
    Effect.gen(function* () {
      const { action } = fakeRead("name.get", (_options: { name: string }) => profile);
      const server = AtomRegistry.make();
      yield* Effect.promise(() => prefetch(server, client(), action, { name: "nick.eth" }));

      const wire = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
        dehydrate(server),
      );
      const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(wire);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Hydration's dehydrated atoms are opaque; the wire round trip returns them
      const state = parsed as Hydration.DehydratedAtom[];
      const browser = AtomRegistry.make();
      Hydration.hydrate(browser, state);
      const result = browser.get(ensAtom(client(), action, { name: "Nick.eth" }));

      assert.isTrue(AsyncResult.isSuccess(result));
      assert.deepStrictEqual(AsyncResult.getOrThrow(result), profile);
    }),
  );

  it.effect("does not send failures, so the browser retries them", () =>
    Effect.gen(function* () {
      const action = fakeEffectRead("name.get", (_options: { name: string }) =>
        Effect.fail("down"),
      );
      const server = AtomRegistry.make();
      yield* Effect.promise(() => prefetch(server, client(), action, { name: "nick.eth" }));

      assert.deepStrictEqual(dehydrate(server), []);
    }),
  );

  // Regression: `refetchInterval` kept polling in the request's registry until it was disposed.
  it.live("does not poll on the server", () =>
    Effect.gen(function* () {
      const { action, calls } = fakeRead("name.get", (_options: { name: string }) => profile);
      const server = AtomRegistry.make();
      yield* Effect.promise(() =>
        prefetch(server, client(), action, { name: "nick.eth" }, { refetchInterval: 5 }),
      );

      yield* Effect.sleep(50);

      assert.strictEqual(calls.length, 1);
    }),
  );
});

describe("streaming", () => {
  it.effect("sends reads still loading as promises that settle in the browser", () =>
    Effect.gen(function* () {
      let resolve = (_value: typeof profile): void => undefined;
      const { action } = fakeRead(
        "name.get",
        // oxlint-disable-next-line effecttsgo/new-promise -- a read the test settles by hand
        (_options: { name: string }) => new Promise<typeof profile>((done) => (resolve = done)),
      );
      const server = AtomRegistry.make();
      void prefetch(server, client(), action, { name: "nick.eth" });

      const state = dehydrate(server, { streaming: true });
      const browser = AtomRegistry.make();
      Hydration.hydrate(browser, state);
      const atom = ensAtom(client(), action, { name: "nick.eth" });
      browser.mount(atom);
      resolve(profile);
      const value = yield* AtomRegistry.getResult(browser, atom);

      assert.strictEqual(state.length, 1);
      assert.deepStrictEqual(value, profile);
    }),
  );
});

describe("server rendering", () => {
  const nameRead = fakeRead("name.get", (_options: { name: string }) => profile);
  const Name = ({ name }: { name: string }) => {
    const { data, status } = useRead(nameRead.action, { name });
    return <p>{data?.name ?? status}</p>;
  };

  it.effect("renders prefetched reads with their data", () =>
    Effect.gen(function* () {
      const ens = client();
      const server = AtomRegistry.make();
      yield* Effect.promise(() => prefetch(server, ens, nameRead.action, { name: "nick.eth" }));
      const state = dehydrate(server);
      nameRead.calls.length = 0;

      const html = renderToString(
        <EnsforgeProvider client={ens}>
          <HydrationBoundary state={state}>
            <Name name="nick.eth" />
          </HydrationBoundary>
        </EnsforgeProvider>,
      );

      assert.include(html, "nick.eth");
      assert.strictEqual(nameRead.calls.length, 0);
    }),
  );

  it("renders other reads as loading without calling them", () => {
    nameRead.calls.length = 0;

    const html = renderToString(
      <RegistryProvider>
        <EnsforgeProvider client={client()} registry={false}>
          <Name name="other.eth" />
        </EnsforgeProvider>
      </RegistryProvider>,
    );

    assert.include(html, "loading");
    assert.strictEqual(nameRead.calls.length, 0);
  });

  // Regression: the list's first page was fetched on the server.
  it("renders paginated lists as loading without calling them", () => {
    const { action, calls } = fakeRead(
      "indexer.getSubnames",
      (_options: { name: string; cursor?: string }) => ({ items: ["a"], cursor: null }),
    );
    const Subnames = () => (
      <p>{useInfiniteRead(action, { name: "ens.eth" }).isLoading && "loading"}</p>
    );

    const html = renderToString(
      <EnsforgeProvider client={client()}>
        <Subnames />
      </EnsforgeProvider>,
    );

    assert.include(html, "loading");
    assert.strictEqual(calls.length, 0);
  });

  // Regression: the read never settled, so a streamed or prerendered page never finished.
  it.effect("renders the fallback of a Suspense read that was not prefetched", () =>
    Effect.gen(function* () {
      nameRead.calls.length = 0;
      const Profile = () => (
        <p>{useSuspenseRead(nameRead.action, { name: "nick.eth" }).data.name}</p>
      );

      const { prelude } = yield* Effect.promise(() =>
        prerender(
          <EnsforgeProvider client={client()}>
            <Suspense fallback="loading">
              <Profile />
            </Suspense>
          </EnsforgeProvider>,
          { onError: () => undefined },
        ),
      ).pipe(Effect.timeout("2 seconds"));
      const html = yield* Effect.promise(() => new Response(prelude).text());

      assert.include(html, "loading");
      assert.strictEqual(nameRead.calls.length, 0);
    }),
  );
});
