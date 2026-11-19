import { assert, describe, it } from "@effect/vitest";

import { sidebarTree } from "@ensforge/docs/internal/lib/page-tree";

// Package folders list their index among their pages, after a separator, as content/docs does.
const packageFolder = (slug: string) => ({
  $id: slug,
  $ref: { folder: slug },
  type: "folder" as const,
  name: slug,
  root: true,
  children: [
    { $id: `${slug}-start`, type: "separator" as const, name: "Getting started" },
    {
      $id: `${slug}-install`,
      $ref: `${slug}/installation.mdx`,
      type: "page" as const,
      name: "Installation",
      url: `/docs/${slug}/installation`,
    },
    {
      $id: `${slug}-index`,
      $ref: `${slug}/index.mdx`,
      type: "page" as const,
      name: "Quick start",
      url: `/docs/${slug}`,
    },
  ],
});

describe("sidebarTree", () => {
  const sdk = packageFolder("sdk");
  const react = packageFolder("react");
  const reference = {
    $id: "reference",
    type: "folder" as const,
    name: "Reference",
    root: "reference",
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
  const tree = { $id: "root", name: "Docs", children: [sdk, react, reference] };

  it("keeps the page's root folder and the pages the package picker links to", () => {
    assert.deepStrictEqual(sidebarTree(tree, "/docs/reference/sdk/record/get").children, [
      { ...sdk, children: [sdk.children[1]] },
      { ...react, children: [react.children[1]] },
      reference,
    ]);
  });

  it("keeps the current page's counterpart in the other packages", () => {
    assert.deepStrictEqual(sidebarTree(tree, "/docs/sdk").children, [
      sdk,
      { ...react, children: [react.children[1], react.children[2]] },
      { ...reference, children: [] },
    ]);
  });

  it("gives each page its own tree id", () => {
    assert.notStrictEqual(
      sidebarTree(tree, "/docs/sdk").$id,
      sidebarTree(tree, "/docs/reference").$id,
    );
  });
});
