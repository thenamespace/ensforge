import { assert, describe, it } from "@effect/vitest";

import { Abis } from "@ensforge/contracts";
import { encodeErrorResult, getAddress, type Hex } from "viem";

import { fromRevert } from "#/errors/translate/revert";

const registry = getAddress("0x00000000000000000000000000000000000000e2");
const nameNotAvailable = encodeErrorResult({
  abi: Abis.shared.errors,
  errorName: "NameNotAvailable",
  args: ["nick.eth"],
});
const unknownSelector = "0xdeadbeef0000" as const;

const resolverError = (inner: Hex): Hex =>
  encodeErrorResult({ abi: Abis.shared.errors, errorName: "ResolverError", args: [inner] });

const resolutionError = (inner: Hex): Hex =>
  encodeErrorResult({
    abi: Abis.shared.errors,
    errorName: "ResolutionError",
    args: [registry, inner],
  });

const errorString = (message: string): Hex =>
  encodeErrorResult({
    abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
    errorName: "Error",
    args: [message],
  });

const nest = (depth: number, inner: Hex): Hex =>
  depth === 0 ? inner : resolverError(nest(depth - 1, inner));

describe("fromRevert unwrapping", () => {
  it.each([
    { label: "ResolverError", data: resolverError(nameNotAvailable) },
    { label: "ResolutionError", data: resolutionError(nameNotAvailable) },
    { label: "WrappedError string", data: errorString(`WrappedError::${nameNotAvailable}`) },
    {
      label: "ResolutionError > ResolverError > WrappedError",
      data: resolutionError(resolverError(errorString(`WrappedError::${nameNotAvailable}`))),
    },
  ])("$label lets the inner revert decide the class", ({ data }) => {
    const error = fromRevert({ data }, { operation: "name.get" });

    assert.strictEqual(error.code, "NAME_NOT_AVAILABLE");
    assert.strictEqual(error.context.operation, "name.get");
    assert.deepStrictEqual(error.context.revert, {
      errorName: "NameNotAvailable",
      data: nameNotAvailable,
    });
  });

  it("ResolutionError adds the registry to the context", () => {
    const error = fromRevert({ data: resolutionError(nameNotAvailable) }, {});

    assert.strictEqual(error.context.registry, registry);
  });

  it("ResolutionError keeps the registry on an unknown inner revert", () => {
    const error = fromRevert({ data: resolutionError(unknownSelector) }, {});

    assert.strictEqual(error.code, "CONTRACT_REVERTED");
    assert.strictEqual(error.context.registry, registry);
  });

  it("an empty ResolverError means the resolver lacks the profile", () => {
    const error = fromRevert({ data: resolverError("0x") }, { name: "nick.eth" });

    assert.strictEqual(error._tag, "UnsupportedError");
    assert.strictEqual(error.code, "RESOLVER_PROFILE_UNSUPPORTED");
    assert.strictEqual(error.context.name, "nick.eth");
  });

  it("unwraps eight levels of nesting", () => {
    assert.strictEqual(
      fromRevert({ data: nest(8, nameNotAvailable) }, {}).code,
      "NAME_NOT_AVAILABLE",
    );
  });

  it("stops at the ninth level instead of recursing further", () => {
    const error = fromRevert({ data: nest(9, nameNotAvailable) }, {});

    assert.strictEqual(error.code, "CONTRACT_REVERTED");
    assert.strictEqual((error as { errorName?: string }).errorName, "ResolverError");
  });
});

describe("fromRevert fallthrough", () => {
  it.each([
    { label: "an unknown selector", revert: { data: unknownSelector }, errorName: undefined },
    { label: "no data", revert: {}, errorName: undefined },
    { label: "a plain Error string", revert: { data: errorString("nope") }, errorName: "Error" },
    {
      label: "a WrappedError with odd-length hex",
      revert: { data: errorString("WrappedError::0xabc") },
      errorName: "Error",
    },
    {
      label: "a WrappedError with non-hex payload",
      revert: { data: errorString("WrappedError::0xzz") },
      errorName: "Error",
    },
    {
      label: "an already-decoded unmapped error",
      revert: { errorName: "SomethingElse", args: [1n] },
      errorName: "SomethingElse",
    },
  ])("$label becomes CONTRACT_REVERTED", ({ revert, errorName }) => {
    const error = fromRevert(revert, { operation: "x.y" });

    assert.strictEqual(error._tag, "ContractRevertError");
    assert.strictEqual(error.code, "CONTRACT_REVERTED");
    assert.strictEqual((error as { errorName?: string }).errorName, errorName);
    assert.strictEqual((error as { data?: Hex }).data, (revert as { data?: Hex }).data);
    assert.deepStrictEqual(error.context, {
      operation: "x.y",
      revert: { errorName, data: (revert as { data?: Hex }).data },
    });
  });

  it("uses an already-decoded error name without decoding the data", () => {
    const error = fromRevert({ errorName: "LabelExpired", args: [1n], data: "0x00" }, {});

    assert.strictEqual(error.code, "NAME_EXPIRED");
    assert.deepStrictEqual(error.context.revert, { errorName: "LabelExpired", data: "0x00" });
  });
});
