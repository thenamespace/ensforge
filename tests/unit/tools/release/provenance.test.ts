import { readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { Attestations, provenanceProblems } from "@ensforge/tools/internal/release/provenance";

// npm's attestations for @ensforge/sdk@0.6.1, published by the release workflow.
const published = Schema.decodeSync(Schema.fromJsonString(Attestations))(
  readFileSync(new URL("../fixtures/release/sdk-0.6.1.attestations.json", import.meta.url), "utf8"),
);
const release = {
  name: "@ensforge/sdk",
  version: "0.6.1",
  sha512Hex:
    "90555943c9dac0a3b87c86d11c0c975bee396f9fdbd919ebb5df605ba54fe38f07042025a78106db4ac3d910dd9d84cf8b0767e3fe10e94cfab84b3d4b2a9209",
};

describe("provenanceProblems", () => {
  it("accepts the release workflow's SLSA provenance for the same tarball", () => {
    assert.deepStrictEqual(provenanceProblems(published, release), []);
  });

  it("rejects provenance for another tarball", () => {
    assert.match(
      provenanceProblems(published, { ...release, sha512Hex: "00" }).join("\n"),
      /provenance subject is not this tarball/,
    );
  });

  it("rejects provenance from another repository or workflow", () => {
    const attestations = {
      attestations: published.attestations.map((attestation) => {
        const statement = JSON.parse(
          Buffer.from(attestation.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
        );
        if (statement.predicate.buildDefinition !== undefined)
          statement.predicate.buildDefinition.externalParameters.workflow.repository =
            "https://github.com/someone/fork";
        const payload = Buffer.from(JSON.stringify(statement)).toString("base64");
        return { ...attestation, bundle: { dsseEnvelope: { payload } } };
      }),
    };

    assert.deepStrictEqual(provenanceProblems(attestations, release), [
      "@ensforge/sdk@0.6.1: built by https://github.com/someone/fork .github/workflows/release.yml, not the release workflow",
    ]);
  });

  it("requires an SLSA provenance attestation, not only npm's publish attestation", () => {
    const publishOnly = {
      attestations: published.attestations.filter(
        (attestation) => attestation.predicateType !== "https://slsa.dev/provenance/v1",
      ),
    };

    assert.deepStrictEqual(provenanceProblems(publishOnly, release), [
      "@ensforge/sdk@0.6.1: no SLSA provenance attestation",
    ]);
  });
});
