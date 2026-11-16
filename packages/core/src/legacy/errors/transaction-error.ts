import { Schema } from "effect";

import { Hex } from "../schemas/hex.js";

export const TransactionErrorCode = Schema.Literals([
  "RECEIPT_REVERTED",
  "CONFIRMATION_TIMEOUT",
  "BATCH_STATUS_FAILED",
  "INVALID_BATCH_STATUS",
]);
export type TransactionErrorCode = typeof TransactionErrorCode.Type;

export class TransactionError extends Schema.TaggedError<TransactionError>()("TransactionError", {
  code: TransactionErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
  transactionHash: Schema.optional(Hex),
  batchId: Schema.optional(Schema.String),
}) {}
