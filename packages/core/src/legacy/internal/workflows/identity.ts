import { keccak256, stringToHex } from "viem";
import { normalize } from "viem/ens";

import { encodeWorkflowValue } from "./codec.js";

// Include domain inputs only. Runtime clients and confirmation preferences are deliberately absent.
export const workflowIdentityFields = {
  registerName: [
    "name",
    "owner",
    "duration",
    "secret",
    "resolver",
    "subregistry",
    "records",
    "reverseRecord",
    "referrer",
    "paymentToken",
    "maxPrice",
  ],
  registerNames: ["registrations"],
  renewName: ["name", "duration", "paymentToken", "maxPrice", "referrer"],
  renewNames: ["renewals", "maxTotalPrice"],
  wrapName: ["name", "owner", "resolver", "fuses"],
  transferName: ["name", "to"],
  setResolverAndRecords: ["name", "records", "resolver", "salt", "admin", "roles", "setters"],
  createSubname: ["name", "owner", "resolver", "ttl", "expiry", "fuses", "roles", "salt"],
  migrateName: ["name", "owner", "resolver", "subregistry", "migrateParent"],
  migrateNames: ["migrations"],
  importDnsName: ["name", "proof", "resolver", "address"],
} as const;
export type WorkflowOperation = keyof typeof workflowIdentityFields;

const normalizeValue = (value: unknown, key: string): unknown => {
  if (typeof value === "string") {
    if (key === "name") return normalize(value);
    if (
      [
        "owner",
        "to",
        "resolver",
        "admin",
        "address",
        "subregistry",
        "paymentToken",
        "secret",
        "referrer",
      ].includes(key) &&
      /^0x[0-9a-fA-F]+$/.test(value)
    )
      return value.toLowerCase();
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry, ""));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([field, entry]) => [field, normalizeValue(entry, field)]),
    );
  return value;
};

export const workflowFingerprint = (
  operation: WorkflowOperation,
  parameters: object,
  context: object,
) => {
  const input = parameters as Record<string, unknown>;
  const selected = Object.fromEntries(
    workflowIdentityFields[operation]
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, normalizeValue(input[key], key)]),
  );

  return keccak256(stringToHex(encodeWorkflowValue({ operation, context, parameters: selected })));
};
