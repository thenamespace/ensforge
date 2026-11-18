# syntax=docker/dockerfile:1.7
#
# bigname built from source with the devnet's manifest profile compiled in. Release images only run
# the manifest profiles hashed into them; bigname's own end-to-end suite builds its phase runner
# the same way, with BIGNAME_E2E_MANIFEST_PROFILE_ROOT naming a profile under `manifests/`.
# The build context is a bigname checkout (see `test/stack/bigname.ts`); this file follows its
# Dockerfile, without the dependency-layer split.

ARG RUST_IMAGE=docker.io/library/rust:1.98.0-bookworm@sha256:82150a52ec202c1b14d7817e14516c392bb7f5cfebd88f1ed531cb37ebd39922
ARG RUNTIME_IMAGE=docker.io/library/ubuntu:24.04@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8

FROM ${RUST_IMAGE} AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends clang libclang-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ENV BIGNAME_E2E_MANIFEST_PROFILE_ROOT=/app/manifests/.bigname-e2e-runtime-profile-devnet

# Reported as `x-build-sha` in the API's OpenAPI document, as on bigname's hosted APIs.
ARG BIGNAME_BUILD_SHA=unknown
ENV BIGNAME_BUILD_SHA=${BIGNAME_BUILD_SHA}

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,id=ensforge-bigname-target \
    cargo build --locked --release --bin phase-runner --bin bigname-api \
    && cp target/release/phase-runner target/release/bigname-api /usr/local/bin/

FROM ${RUNTIME_IMAGE} AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libgcc-s1 libstdc++6 tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 bigname \
    && useradd --system --uid 10001 --gid bigname --home-dir /app --create-home bigname

WORKDIR /app

COPY --from=builder /usr/local/bin/phase-runner /usr/local/bin/bigname-api /usr/local/bin/
COPY --from=builder --chown=bigname:bigname /app/manifests /app/manifests
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/bigname

RUN chmod 755 /app && chmod -R a+rX /app/manifests

ENV BIGNAME_API_BIND_ADDR=0.0.0.0:3000 \
    BIGNAME_PHASE_RUNNER_MANIFESTS_ROOT=/app/manifests/.bigname-e2e-runtime-profile-devnet \
    RUST_LOG=info

EXPOSE 3000
USER bigname
ENTRYPOINT ["tini", "--", "bigname"]
CMD ["api"]
