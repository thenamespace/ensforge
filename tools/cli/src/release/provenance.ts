import { Option, Schema } from "effect";

/** npm's `/-/npm/v1/attestations/<name>@<version>` response. */
export const Attestations = Schema.Struct({
  attestations: Schema.Array(
    Schema.Struct({
      predicateType: Schema.String,
      bundle: Schema.Struct({
        dsseEnvelope: Schema.Struct({ payload: Schema.String }),
      }),
    }),
  ),
});

/** The in-toto statement of an SLSA provenance attestation (DSSE payload). */
const Statement = Schema.Struct({
  subject: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      digest: Schema.Struct({ sha512: Schema.optionalKey(Schema.String) }),
    }),
  ),
  predicate: Schema.Struct({
    buildDefinition: Schema.Struct({
      externalParameters: Schema.Struct({
        workflow: Schema.Struct({ repository: Schema.String, path: Schema.String }),
      }),
    }),
  }),
});
const decodeStatement = Schema.decodeUnknownOption(Schema.fromJsonString(Statement));

export const slsaProvenance = "https://slsa.dev/provenance/v1";

/** The workflow npm's trusted publisher accepts for ensforge's packages. */
export const releaseWorkflow = {
  repository: "https://github.com/thenamespace/ensforge",
  path: ".github/workflows/release.yml",
} as const;

/**
 * Checks a package version's npm provenance: an SLSA attestation whose subject is this tarball
 * (sha512 of the published bytes, as hex) and that was built by the release workflow. The
 * signature itself is npm's to verify (`npm audit signatures`); this binds the attestation to the
 * archive the release verified.
 */
export const provenanceProblems = (
  attestations: typeof Attestations.Type,
  release: { readonly name: string; readonly version: string; readonly sha512Hex: string },
) => {
  const id = `${release.name}@${release.version}`;
  const provenance = attestations.attestations.find(
    (attestation) => attestation.predicateType === slsaProvenance,
  );
  if (provenance === undefined) return [`${id}: no SLSA provenance attestation`];

  const statement = decodeStatement(
    Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
  );
  if (Option.isNone(statement)) return [`${id}: unreadable provenance statement`];

  const problems: string[] = [];
  const subject = `pkg:npm/${release.name.replace("@", "%40")}@${release.version}`;
  const digests = statement.value.subject
    .filter((entry) => entry.name === subject)
    .map((entry) => entry.digest.sha512);
  if (!digests.includes(release.sha512Hex))
    problems.push(
      `${id}: provenance subject is not this tarball (${digests.join(", ") || "none"})`,
    );

  const { workflow } = statement.value.predicate.buildDefinition.externalParameters;
  if (workflow.repository !== releaseWorkflow.repository || workflow.path !== releaseWorkflow.path)
    problems.push(
      `${id}: built by ${workflow.repository} ${workflow.path}, not the release workflow`,
    );
  return problems;
};
