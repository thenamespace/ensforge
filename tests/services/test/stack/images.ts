// Service images, pinned by digest.
export const images = {
  alto: "ghcr.io/pimlicolabs/alto:v1.2.8@sha256:f2661042aadefc6a4fc9c5826a14404f574c7ef2de76bdf83fe6a0829137b3c5",
  postgres:
    "docker.io/library/postgres:16.16-alpine3.24@sha256:81e77a4833487b8132fe4b00bedd39dc3f74b8641e387f19312a48f7de218c2e",
} as const;

/**
 * bigname's source, built locally with the devnet's manifest profile (`bigname/Dockerfile`):
 * release images only run the profiles compiled into them.
 */
export const bignameSource = {
  repository: "https://github.com/ensdomains/bigname.git",
  tag: "v0.14.11",
  commit: "df128caab6f690262f386bbf3d1f70b424f5c7f9",
} as const;
