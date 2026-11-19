import { assert, describe, it } from "@effect/vitest";

import { sidebarTree } from "@ensforge/docs/internal/lib/page-tree";

describe("sidebarTree", () => {
  const sdk = {
    $id: "sdk",
    type: "folder" as const,
    name: "SDK",
    root: true,
    index: { $id: "sdk-index", type: "page" as const, name: "SDK", url: "/docs/sdk" },
    children: [
      {
        $id: "install",
        type: "page" as const,
        name: "Installation",
        url: "/docs/sdk/installation",
      },
    ],
  };
  const reference = {
    $id: "reference",
    type: "folder" as const,
    name: "Reference",
    root: true,
    index: { $id: "ref-index", type: "page" as const, name: "Reference", url: "/docs/reference" },
    children: [
      {
        $id: "record",
        type: "folder" as const,
        name: "record",
        children: [
          {
            $id: "get",
            type: "page" as const,
            name: "record.get",
            url: "/docs/reference/sdk/record/get",
          },
        ],
      },
    ],
  };
  const tree = { $id: "root", name: "Docs", children: [sdk, reference] };

  it("keeps the page's root folder and only the index of the others", () => {
    assert.deepStrictEqual(sidebarTree(tree, "/docs/reference/sdk/record/get").children, [
      { ...sdk, children: [] },
      reference,
    ]);
  });

  it("matches a root folder by its index page", () => {
    assert.deepStrictEqual(sidebarTree(tree, "/docs/sdk").children, [
      sdk,
      { ...reference, children: [] },
    ]);
  });
});
