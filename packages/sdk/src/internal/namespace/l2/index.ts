// L2 reads, loaded only for names that live on an L2.
export { recordAccess, transferAccess, type RecordAccess } from "./permission.js";
export { l2ResolverOf, resolveOnL2 } from "./records.js";
export { readL2State, type L2State } from "./state.js";
export { l2OperatorContract, l2TokenOf, l2TransferCalls, type L2Token } from "./tokens.js";
