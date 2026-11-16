import type {
  IndexedRegistration,
  RegistrationFilter,
  RegistrationOrder,
} from "../../../actions/indexer/models/registration.js";
import { IndexerFilterError } from "../../../errors/indexer-filter-error.js";

export const matchesRegistrationFilter = (
  registration: IndexedRegistration,
  filter: RegistrationFilter,
): boolean => {
  if (
    filter.registrant !== undefined &&
    registration.registrant.toLowerCase() !== filter.registrant.toLowerCase()
  )
    return false;

  if (filter.protocols !== undefined && !filter.protocols.includes(registration.protocol))
    return false;

  if (filter.expiryAfter !== undefined && registration.expiry <= filter.expiryAfter) return false;

  if (filter.expiryBefore !== undefined && registration.expiry >= filter.expiryBefore) return false;

  return true;
};

export const compareRegistrations =
  (order: RegistrationOrder) =>
  (left: IndexedRegistration, right: IndexedRegistration): number => {
    let compared: number;

    if (order.field === "name") {
      const leftName = left.name.value ?? left.namehash;
      const rightName = right.name.value ?? right.namehash;

      compared = leftName.localeCompare(rightName);
    } else {
      const leftValue = order.field === "expiry" ? left.expiry : left.registeredAt;
      const rightValue = order.field === "expiry" ? right.expiry : right.registeredAt;

      compared = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    }

    if (compared === 0) compared = left.id.localeCompare(right.id);

    return order.direction === "asc" ? compared : -compared;
  };

export const validateRegistrationFilter = (filter: RegistrationFilter): void => {
  if (filter.protocols?.length === 0) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "At least one registration protocol is required",
    });
  }

  if (
    filter.expiryAfter !== undefined &&
    filter.expiryBefore !== undefined &&
    filter.expiryAfter >= filter.expiryBefore
  ) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "expiryAfter must be less than expiryBefore",
    });
  }
};
