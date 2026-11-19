import * as PageTree from "fumadocs-core/page-tree";

/**
 * The page tree a docs page needs: the root folder it belongs to in full, and of every other
 * root folder (a package's guides, the reference) only the pages the package picker links to.
 * Their other pages are most of the tree's weight, and every page would otherwise inline them.
 */
export function sidebarTree(tree: PageTree.Root, url: string): PageTree.Root {
  const path = PageTree.findPath(tree.children, (node) => node.type === "page" && node.url === url);
  const active = path?.find((node) => node.type === "folder" && node.root);
  const page = path?.at(-1);

  return {
    ...tree,
    // Fumadocs memoizes the tree by `$id`; without one per page, client-side navigation keeps
    // the previous page's sidebar.
    $id: `${tree.$id}:${url}`,
    children: tree.children.map((node) => {
      if (node === active || node.type !== "folder" || !node.root) return node;

      // The picker links to the folder's index or first page (as `getLayoutTabs` finds it), or
      // to the current page's counterpart in that folder.
      const landing = node.index
        ? undefined
        : (node.children.find((child) => child.type === "page") ??
          PageTree.findPath(node.children, (child) => child.type === "page")?.at(-1));
      const counterpart =
        active?.type === "folder" && page?.type === "page"
          ? PageTree.findProjection(active, node, page)
          : undefined;

      return {
        ...node,
        children: [...new Set([landing, counterpart])].filter((child) => child !== undefined),
      };
    }),
  };
}
