import type { IndexedName, NameOrder } from "../../../actions/indexer/models/index.js";

const nameValue = (name: IndexedName): string | null =>
  name.name.kind === "unknown" ? null : name.name.value.toLowerCase();

const compareString = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const compareBigInt = (left: bigint, right: bigint) => (left < right ? -1 : left > right ? 1 : 0);

const compareIdentity = (order: NameOrder, left: IndexedName, right: IndexedName) => {
  const identity = compareString(left.namehash.toLowerCase(), right.namehash.toLowerCase());

  return order.direction === "asc" ? identity : -identity;
};

export const compareIndexedNames =
  (order: NameOrder) => (left: IndexedName, right: IndexedName) => {
    const primary = (() => {
      switch (order.field) {
        case "createdAt":
          return compareBigInt(left.createdAt, right.createdAt);
        case "name": {
          const leftName = nameValue(left);
          const rightName = nameValue(right);

          if (leftName === null) return rightName === null ? 0 : null;

          if (rightName === null) return undefined;

          return compareString(leftName, rightName);
        }
        case "expiry":
          if (left.expiry === null) return right.expiry === null ? 0 : null;

          if (right.expiry === null) return undefined;

          return compareBigInt(left.expiry, right.expiry);
      }
    })();

    if (primary === null) return 1;

    if (primary === undefined) return -1;

    const directed = order.direction === "asc" ? primary : -primary;

    return directed === 0 ? compareIdentity(order, left, right) : directed;
  };

export const compileV1NameOrder = (order: NameOrder) => ({
  orderBy:
    order.field === "createdAt" ? "createdAt" : order.field === "expiry" ? "expiryDate" : "name",
  orderDirection: order.direction,
});

export const compileV2NameOrder = compileV1NameOrder;
