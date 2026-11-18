/* oxlint-disable effecttsgo/async-function -- testing-library `act` and `waitFor` are Promise APIs, so the tests are async functions */
import { Component, Suspense, type ReactNode } from "react";

import { assert, describe, it } from "@effect/vitest";

import {
  EnsforgeProvider,
  ReadErrorResetBoundary,
  useInfiniteRead,
  useReadErrorReset,
  useReads,
  useSuspenseRead,
} from "@ensforge/react";
import type { Ensforge } from "@ensforge/sdk";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

import { client, fakeRead } from "../fixtures.js";

// Hooks render through testing-library, whose `act` and `waitFor` are Promise APIs.
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const wrapper = (ens: Ensforge.Client) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <EnsforgeProvider client={ens}>{children}</EnsforgeProvider>;
  };

describe("useReads", () => {
  // Regression: the reads were rebuilt only when their keys changed, so a new client or new
  // freshness kept the old atoms.
  it("reads with the client it is given now", async () => {
    const alice = client({ account: "0x00000000000000000000000000000000000a11ce" });
    const bob = client({ account: "0x0000000000000000000000000000000000000b0b" });
    const action = Object.assign(
      async (ens: Ensforge.Client, _options: { name: string }) => ens.account,
      { path: "test.account" },
    );
    const { result, rerender } = renderHook(
      ({ ens }) => useReads([[action, { name: "a.eth" }]] as const, { client: ens }),
      { wrapper: wrapper(alice), initialProps: { ens: alice } },
    );
    await waitFor(() => assert.strictEqual(result.current[0].data, alice.account));

    rerender({ ens: bob });

    await waitFor(() => assert.strictEqual(result.current[0].data, bob.account));
  });

  it("applies freshness it is given later", async () => {
    const { action, calls } = fakeRead("test.get", (options: { name: string }) => options.name);
    const { result, rerender } = renderHook(
      ({ refetchInterval }: { refetchInterval: number | undefined }) =>
        useReads([[action, { name: "a.eth" }]] as const, { refetchInterval }),
      {
        wrapper: wrapper(client()),
        initialProps: { refetchInterval: undefined as number | undefined },
      },
    );
    await waitFor(() => assert.strictEqual(result.current[0].status, "success"));

    rerender({ refetchInterval: 10 });

    await waitFor(() => assert.isAtLeast(calls.length, 3));
  });
});

describe("useInfiniteRead", () => {
  it.each([
    ["undefined options", undefined, {}],
    ["enabled: false", { name: "ens.eth" }, { enabled: false }],
  ] as const)("stays idle without loading with %s", (_, options, config) => {
    const { action, calls } = fakeRead(
      "indexer.getSubnames",
      (_options: { name: string; cursor?: string }) => ({ items: [], cursor: null }),
    );
    const { result } = renderHook(() => useInfiniteRead(action, options, config), {
      wrapper: wrapper(client()),
    });

    assert.deepStrictEqual(result.current.items, []);
    assert.isFalse(result.current.isLoading);
    assert.isFalse(result.current.hasMore);
    assert.strictEqual(calls.length, 0);
  });
});

class Boundary extends Component<
  { readonly children: ReactNode; readonly onReset?: (() => void) | undefined },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? (
      <button
        onClick={() => {
          this.props.onReset?.();
          this.setState({ failed: false });
        }}
      >
        retry
      </button>
    ) : (
      this.props.children
    );
  }
}

const ResettingBoundary = ({ children }: { readonly children: ReactNode }) => {
  const { reset } = useReadErrorReset();
  return <Boundary onReset={reset}>{children}</Boundary>;
};

describe("useSuspenseRead", () => {
  // Regression: the failure stayed cached, so a reset boundary threw it again.
  it("reads again after its error boundary is reset", async () => {
    let attempts = 0;
    const { action, calls } = fakeRead("test.flaky", (_options: { name: string }) =>
      attempts++ === 0 ? Promise.reject(new Error("blip")) : "ok",
    );
    const Url = () => <p>{useSuspenseRead(action, { name: "a.eth" }).data}</p>;
    render(
      <EnsforgeProvider client={client()}>
        <ReadErrorResetBoundary>
          {({ reset }) => (
            <Boundary onReset={reset}>
              <Suspense fallback="loading">
                <Url />
              </Suspense>
            </Boundary>
          )}
        </ReadErrorResetBoundary>
      </EnsforgeProvider>,
      { onCaughtError: () => undefined },
    );
    await screen.findByText("retry");

    fireEvent.click(screen.getByText("retry"));

    await screen.findByText("ok");
    assert.strictEqual(calls.length, 2);
  });

  it("reads again after the app-wide reset without a boundary component", async () => {
    let attempts = 0;
    const { action, calls } = fakeRead("test.flaky2", (_options: { name: string }) =>
      attempts++ === 0 ? Promise.reject(new Error("blip")) : "ok",
    );
    const Url = () => <p>{useSuspenseRead(action, { name: "a.eth" }).data}</p>;
    render(
      <EnsforgeProvider client={client()}>
        <ResettingBoundary>
          <Suspense fallback="loading">
            <Url />
          </Suspense>
        </ResettingBoundary>
      </EnsforgeProvider>,
      { onCaughtError: () => undefined },
    );
    await screen.findByText("retry");

    fireEvent.click(screen.getByText("retry"));

    await screen.findByText("ok");
    assert.strictEqual(calls.length, 2);
  });

  // React renders a throwing component again before the boundary commits, and a boundary that
  // resets without calling `reset` renders it again after: neither may read again.
  it("rethrows the cached failure until reset is called", async () => {
    const { action, calls } = fakeRead("test.down", (_options: { name: string }) =>
      Promise.reject(new Error("down")),
    );
    const Url = () => <p>{useSuspenseRead(action, { name: "a.eth" }).data}</p>;
    render(
      <EnsforgeProvider client={client()}>
        <ReadErrorResetBoundary>
          <Boundary>
            <Suspense fallback="loading">
              <Url />
            </Suspense>
          </Boundary>
        </ReadErrorResetBoundary>
      </EnsforgeProvider>,
      { onCaughtError: () => undefined },
    );
    await screen.findByText("retry");

    fireEvent.click(screen.getByText("retry"));
    await screen.findByText("retry");

    assert.strictEqual(calls.length, 1);
  });
});
