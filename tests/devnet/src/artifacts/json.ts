import { Array as Arr, Effect, FileSystem, Schema } from "effect";

import { isHex, type Abi, type Hex } from "viem";

import { ArtifactError } from "../errors.ts";

/** An ABI: viem types it deeply, so only its shape (an array) is checked. */
export const AbiSchema = Schema.declare((value): value is Abi => Arr.isArray(value));

export const HexSchema = Schema.declare((value): value is Hex => isHex(value));

/** Reads `file` as JSON and decodes it with `schema`; any failure is an `ArtifactError`. */
export const readJson = <S extends Schema.Top>(file: string, schema: S) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(text);
  }).pipe(
    Effect.mapError((cause) => ArtifactError.make({ artifact: file, message: String(cause) })),
  );
