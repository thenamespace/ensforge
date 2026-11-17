import { Schema } from "effect";

export const EnsProtocol = Schema.Literals(["v1", "v2"]);

export type EnsProtocol = typeof EnsProtocol.Type;
