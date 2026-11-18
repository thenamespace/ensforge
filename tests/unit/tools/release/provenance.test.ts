import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Schema } from "effect";

import { Attestations, provenanceProblems } from "@ensforge/tools/internal/release/provenance";

// npm's attestations for @ensforge/sdk@0.6.1, published by the release workflow.
const loadPublished = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const file = fileURLToPath(
    new URL("../fixtures/release/sdk-0.6.1.attestations.json", import.meta.url),
  );
  const json = yield* fs.readFileString(file);
  return yield* Schema.decodeEffect(Schema.fromJsonString(Attestations))(json);
});
const release = {
  name: "@ensforge/sdk",
  version: "0.6.1",
  sha512Hex:
    "90555943c9dac0a3b87c86d11c0c975bee396f9fdbd919ebb5df605ba54fe38f07042025a78106db4ac3d910dd9d84cf8b0767e3fe10e94cfab84b3d4b2a9209",
};

const Statement = Schema.fromJsonString(Schema.Any);

layer(NodeServices.layer)("provenanceProblems", (it) => {
  it.effect("accepts the release workflow's SLSA provenance for the same tarball", () =>
    Effect.gen(function* () {
      const published = yield* loadPublished;

      assert.deepStrictEqual(provenanceProblems(published, release), []);
    }),
  );

  it.effect("rejects provenance for another tarball", () =>
    Effect.gen(function* () {
      const published = yield* loadPublished;

      assert.match(
        Arr.join(provenanceProblems(published, { ...release, sha512Hex: "00" }), "\n"),
        /provenance subject is not this tarball/,
      );
    }),
  );

  it.effect("rejects provenance from another repository or workflow", () =>
    Effect.gen(function* () {
      const published = yield* loadPublished;
      const attestations = {
        attestations: yield* Effect.forEach(
          published.attestations,
          (attestation) =>
            Effect.gen(function* () {
              const statement = yield* Schema.decodeEffect(Statement)(
                Buffer.from(attestation.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
              );
              if (statement.predicate.buildDefinition !== undefined)
                statement.predicate.buildDefinition.externalParameters.workflow.repository =
                  "https://github.com/someone/fork";
              const statementJson = yield* Schema.encodeEffect(Statement)(statement);
              const payload = Buffer.from(statementJson).toString("base64");
              return { ...attestation, bundle: { dsseEnvelope: { payload } } };
            }),
          { concurrency: 1 },
        ),
      };

      assert.deepStrictEqual(provenanceProblems(attestations, release), [
        "@ensforge/sdk@0.6.1: built by https://github.com/someone/fork .github/workflows/release.yml, not the release workflow",
      ]);
    }),
  );

  it.effect("requires an SLSA provenance attestation, not only npm's publish attestation", () =>
    Effect.gen(function* () {
      const published = yield* loadPublished;
      const publishOnly = {
        attestations: Arr.filter(
          published.attestations,
          (attestation) => attestation.predicateType !== "https://slsa.dev/provenance/v1",
        ),
      };

      assert.deepStrictEqual(provenanceProblems(publishOnly, release), [
        "@ensforge/sdk@0.6.1: no SLSA provenance attestation",
      ]);
    }),
  );
});
