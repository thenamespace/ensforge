import type * as PageTree from "fumadocs-core/page-tree";

/**
 * The page tree a docs page needs: the root folder it belongs to in full, and every other root
 * folder (a package's guides, the reference) with its index page only. The package picker and
 * the Guides / Reference switch link to those index pages; their other pages are most of the
 * tree's weight, and every page would otherwise inline all of them.
 */
export function sidebarTree(tree: PageTree.Root, url: string): PageTree.Root {
  return {
    ...tree,
    children: tree.children.map((node) =>
      node.type === "folder" && node.root && !contains(node, url)
        ? { ...node, children: [] }
        : node,
    ),
  };
}

function contains(node: PageTree.Node, url: string): boolean {
  if (node.type === "page") return node.url === url;
  if (node.type !== "folder") return false;

  return node.index?.url === url || node.children.some((child) => contains(child, url));
}
