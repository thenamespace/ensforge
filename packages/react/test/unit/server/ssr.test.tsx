import { renderToString } from "react-dom/server";

import { RegistryProvider } from "@effect/atom-react";
// @vitest-environment node
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AsyncResult, AtomRegistry, Hydration } from "effect/reactivity";

import { ensAtom } from "#/atoms/index";
import { EnsforgeProvider, HydrationBoundary, useRead } from "#/index";
import { dehydrate, prefetch } from "#/server/index";

import { client, fakeEffectRead, fakeRead } from "../../fixtures.js";

const profile = { name: "nick.eth", expiry: 1_700_000_000n, hash: new Uint8Array([1, 2, 255]) };

describe("prefetch and dehydrate", () => {
  it("sends prefetched values to another registry, bigints and bytes included", async () => {
    const { action } = fakeRead("name.get", (_options: { name: string }) => profile);
    const server = AtomRegistry.make();
    await prefetch(server, client(), action, { name: "nick.eth" });

    const state = JSON.parse(JSON.stringify(dehydrate(server))) as Hydration.DehydratedAtom[];
    const browser = AtomRegistry.make();
    Hydration.hydrate(browser, state);
    const result = browser.get(ensAtom(client(), action, { name: "Nick.eth" }));

    assert.isTrue(AsyncResult.isSuccess(result));
    assert.deepStrictEqual(AsyncResult.getOrThrow(result), profile);
  });

  it("does not send failures, so the browser retries them", async () => {
    const action = fakeEffectRead("name.get", (_options: { name: string }) => Effect.fail("down"));
    const server = AtomRegistry.make();
    await prefetch(server, client(), action, { name: "nick.eth" });

    assert.deepStrictEqual(dehydrate(server), []);
  });
});

describe("streaming", () => {
  it("sends reads still loading as promises that settle in the browser", async () => {
    let resolve = (_value: typeof profile): void => undefined;
    const { action } = fakeRead(
      "name.get",
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
    const value = await Effect.runPromise(AtomRegistry.getResult(browser, atom));

    assert.strictEqual(state.length, 1);
    assert.deepStrictEqual(value, profile);
  });
});

describe("server rendering", () => {
  const Name = ({ name }: { name: string }) => {
    const { data, status } = useRead(nameRead.action, { name });
    return <p>{data?.name ?? status}</p>;
  };
  const nameRead = fakeRead("name.get", (_options: { name: string }) => profile);

  it("renders prefetched reads with their data", async () => {
    const ens = client();
    const server = AtomRegistry.make();
    await prefetch(server, ens, nameRead.action, { name: "nick.eth" });
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
  });

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
});
