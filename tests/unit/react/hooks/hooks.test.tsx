/* oxlint-disable effecttsgo/async-function -- testing-library `act` and `waitFor` are Promise APIs, so the tests are async functions */
/* oxlint-disable typescript/no-unsafe-type-assertion -- partial Plan and Step fixtures, and the write's name as its hash */
import type { ReactNode } from "react";

import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { EnsforgeProvider, useInfiniteRead, useRead, useReads, useWrite } from "@ensforge/react";
import type { Ensforge, Plan, Write } from "@ensforge/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Hex } from "viem";

import { client, fakeRead } from "../fixtures.js";

// Hooks render through testing-library, whose `act` and `waitFor` are Promise APIs.
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const wrapper = (ens: Ensforge.Client) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <EnsforgeProvider client={ens}>{children}</EnsforgeProvider>;
  };

describe("useRead", () => {
  it("goes from loading to success", async () => {
    const { action } = fakeRead("test.get", (options: { name: string }) => `${options.name}!`);
    const { result } = renderHook(() => useRead(action, { name: "nick.eth" }), {
      wrapper: wrapper(client()),
    });

    assert.strictEqual(result.current.status, "loading");
    await waitFor(() => assert.strictEqual(result.current.status, "success"));
    assert.strictEqual(result.current.data, "nick.eth!");
  });

  it("stays idle without calling the action while options are undefined", () => {
    const { action, calls } = fakeRead("test.get", (_options: { name: string }) => 1);
    const { result } = renderHook(() => useRead(action, undefined), { wrapper: wrapper(client()) });

    assert.strictEqual(result.current.status, "idle");
    assert.strictEqual(calls.length, 0);
  });

  it("reports the action's error", async () => {
    const failure = { _tag: "NotFoundError", code: "NAME_NOT_FOUND" };
    const { action } = fakeRead("test.get", (_options: { name: string }) =>
      Promise.reject(failure),
    );
    const { result } = renderHook(() => useRead(action, { name: "a.eth" }), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => assert.strictEqual(result.current.status, "error"));
    assert.deepStrictEqual(result.current.error, failure);
  });

  it("fails clearly outside a provider", () => {
    const { action } = fakeRead("test.get", (_options: { name: string }) => 1);
    assert.throws(() => renderHook(() => useRead(action, { name: "a.eth" })), /EnsforgeProvider/);
  });
});

describe("useReads", () => {
  it("returns one result per read, in order", async () => {
    const { action } = fakeRead("test.get", (options: { name: string }) => options.name.length);
    const { result } = renderHook(
      () =>
        useReads([
          [action, { name: "a.eth" }],
          [action, { name: "abc.eth" }],
        ] as const),
      { wrapper: wrapper(client()) },
    );

    await waitFor(() =>
      assert.deepStrictEqual(
        Arr.map(result.current, (read) => read.data),
        [5, 7],
      ),
    );
  });
});

describe("useInfiniteRead", () => {
  it("loads the first page, then the next on loadMore", async () => {
    const first = { items: ["a", "b"], cursor: "2" as string | null, hasMore: true };
    const last = { items: ["c"], cursor: null as string | null, hasMore: false };
    const { action } = fakeRead(
      "indexer.getSubnames",
      (options: { name: string; cursor?: string }) => (options.cursor === "2" ? last : first),
    );
    const { result } = renderHook(() => useInfiniteRead(action, { name: "ens.eth" }), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => assert.deepStrictEqual(result.current.items, ["a", "b"]));
    assert.isTrue(result.current.hasMore);
    act(() => result.current.loadMore());
    await waitFor(() => assert.deepStrictEqual(result.current.items, ["a", "b", "c"]));
    assert.isFalse(result.current.hasMore);
  });
});

// A write that settles when the test says so, with its name as its hash.
const heldWrite = () => {
  const settle: Record<string, (outcome: "succeed" | "fail") => void> = {};
  const action = Object.assign(
    (_client: Ensforge.Client, options: { name: string }) =>
      // oxlint-disable-next-line effecttsgo/new-promise -- a write the test settles by hand
      new Promise<Write.Result>((resolve, reject) => {
        settle[options.name] = (outcome) =>
          outcome === "succeed"
            ? resolve({ hash: options.name as Hex, hashes: [], id: undefined, plan: {} as Plan })
            : reject(Object.assign(new Error("reverted"), { code: "TRANSACTION_REVERTED" }));
      }),
    { path: "test.set" },
  );
  return { action, settle };
};

describe("useWrite", () => {
  const step = { id: "records", description: "Set records", calls: [] } as unknown as Plan.Step;
  const write = Object.assign(
    async (
      _client: Ensforge.Client,
      options: { name: string; onStep?: (event: Plan.Event) => void },
    ): Promise<Write.Result> => {
      options.onStep?.({ step, status: "submitted", hashes: [] });
      if (options.name === "fail.eth")
        throw Object.assign(new Error("rejected"), { code: "USER_REJECTED" });
      return { hash: "0x1", hashes: [], id: undefined, plan: {} as Plan };
    },
    { path: "test.set" },
  );

  it("tracks status, steps and data, and resets", async () => {
    const { result } = renderHook(() => useWrite(write), { wrapper: wrapper(client()) });
    assert.strictEqual(result.current.status, "idle");

    act(() => result.current.mutate({ name: "alice.eth" }));
    await waitFor(() => assert.strictEqual(result.current.status, "success"));
    assert.strictEqual(result.current.data?.hash, "0x1");
    assert.deepStrictEqual(
      Arr.map(result.current.steps, (event) => event.status),
      ["submitted"],
    );

    act(() => result.current.reset());
    assert.strictEqual(result.current.status, "idle");
    assert.deepStrictEqual(result.current.steps, []);
  });

  it("rejects mutateAsync with the write's error", async () => {
    const { result } = renderHook(() => useWrite(write), { wrapper: wrapper(client()) });

    let error: unknown;
    await act(() =>
      result.current
        .mutateAsync({ name: "fail.eth" })
        .catch((cause: unknown) => void (error = cause)),
    );

    assert.include(error, { code: "USER_REJECTED" });
    assert.strictEqual(result.current.status, "error");
  });

  it("settles each mutateAsync with its own write, and shows the latest one started", async () => {
    const { action, settle } = heldWrite();
    const { result } = renderHook(() => useWrite(action), { wrapper: wrapper(client()) });

    const first = result.current.mutateAsync({ name: "first" });
    const second = result.current.mutateAsync({ name: "second" });
    act(() => settle.second?.("succeed"));
    await waitFor(() => assert.strictEqual(result.current.data?.hash, "second"));
    act(() => settle.first?.("succeed"));

    assert.strictEqual((await first).hash, "first");
    assert.strictEqual((await second).hash, "second");
    assert.strictEqual(result.current.data?.hash, "second");
  });

  it("clears the state on reset while a write is pending; the write still settles its promise", async () => {
    const { action, settle } = heldWrite();
    const { result } = renderHook(() => useWrite(action), { wrapper: wrapper(client()) });

    const pending = result.current.mutateAsync({ name: "alice.eth" });
    await waitFor(() => assert.strictEqual(result.current.status, "pending"));
    act(() => result.current.reset());
    assert.strictEqual(result.current.status, "idle");
    act(() => settle["alice.eth"]?.("succeed"));

    assert.strictEqual((await pending).hash, "alice.eth");
    assert.strictEqual(result.current.status, "idle");
  });

  it("drops the previous data when a later write fails", async () => {
    const { action, settle } = heldWrite();
    const { result } = renderHook(() => useWrite(action), { wrapper: wrapper(client()) });

    act(() => result.current.mutate({ name: "alice.eth" }));
    act(() => settle["alice.eth"]?.("succeed"));
    await waitFor(() => assert.strictEqual(result.current.status, "success"));
    act(() => result.current.mutate({ name: "bob.eth" }));
    act(() => settle["bob.eth"]?.("fail"));
    await waitFor(() => assert.strictEqual(result.current.status, "error"));

    assert.isUndefined(result.current.data);
  });

  it("keeps mutate, mutateAsync and reset stable across renders", () => {
    const { result, rerender } = renderHook(() => useWrite(write), { wrapper: wrapper(client()) });
    const { mutate, mutateAsync, reset } = result.current;

    rerender();

    assert.strictEqual(result.current.mutate, mutate);
    assert.strictEqual(result.current.mutateAsync, mutateAsync);
    assert.strictEqual(result.current.reset, reset);
  });

  it("gives each component its own state", async () => {
    const ens = client();
    const first = renderHook(() => useWrite(write), { wrapper: wrapper(ens) });
    const second = renderHook(() => useWrite(write), { wrapper: wrapper(ens) });

    act(() => first.result.current.mutate({ name: "alice.eth" }));
    await waitFor(() => assert.strictEqual(first.result.current.status, "success"));

    assert.strictEqual(second.result.current.status, "idle");
  });
});
