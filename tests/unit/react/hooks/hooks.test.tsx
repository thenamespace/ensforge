import type { ReactNode } from "react";

import { assert, describe, it } from "@effect/vitest";

import { EnsforgeProvider, useInfiniteRead, useRead, useReads, useWrite } from "@ensforge/react";
import type { Ensforge, Plan, Write } from "@ensforge/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";

import { client, fakeRead } from "../fixtures.js";

// Hooks render through testing-library, whose `act` and `waitFor` are Promise APIs; these tests
// stay plain async functions.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
        result.current.map((read) => read.data),
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
      result.current.steps.map((event) => event.status),
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

  it("gives each component its own state", async () => {
    const ens = client();
    const first = renderHook(() => useWrite(write), { wrapper: wrapper(ens) });
    const second = renderHook(() => useWrite(write), { wrapper: wrapper(ens) });

    act(() => first.result.current.mutate({ name: "alice.eth" }));
    await waitFor(() => assert.strictEqual(first.result.current.status, "success"));

    assert.strictEqual(second.result.current.status, "idle");
  });
});
