# syntax=docker/dockerfile:1.7
#
# The docs site as a Node server (Nitro's node-server output), following Turborepo's Docker guide:
# `turbo prune` keeps only the docs app and the workspace packages it builds against, so the
# dependency layer is reused until one of their manifests or the lockfile changes.
#
# Build from the repository root:
#   docker build -f apps/docs/Dockerfile --secret id=dotenv,src=apps/docs/.env.production .
# The optional `dotenv` secret holds the build's VITE_* (and PostHog upload) variables; it never
# reaches an image layer.

ARG NODE_IMAGE=docker.io/library/node:26.13.1-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    TURBO_TELEMETRY_DISABLED="1"
# Node 25+ ships without corepack: the root package.json's packageManager, and the catalog's turbo.
RUN npm install --global --no-audit --no-fund pnpm@12.21.0 turbo@2.11.11

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @ensforge/docs --docker --root-turbo-json .config/turbo.json

FROM base AS builder
# The docs read each page's last change from git history.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependencies first: this layer changes only with the pruned manifests and lockfile. No lifecycle
# scripts: the root `prepare` installs git hooks and patches the dev toolchain, which the build
# does not use.
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ ./
# Not part of any package: the tool configs (turbo.json among them) and the history.
COPY .config/ ./.config/
COPY .git/ ./.git/

# The packages build first: twoslash code blocks read their types.
ARG GIT_SHA=dev
# A hash of the dotenv secret: secrets do not change the cache key, so a new one rebuilds this step.
ARG DOTENV_SHA256=""
RUN --mount=type=secret,id=dotenv,required=false \
    if [ -f /run/secrets/dotenv ]; then cp /run/secrets/dotenv apps/docs/.env.production; fi \
    && NODE_ENV=production GIT_SHA="$GIT_SHA" turbo --root-turbo-json .config/turbo.json \
      run build --filter=@ensforge/docs... \
    && rm -f apps/docs/.env.production

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV="production" \
    HOST="0.0.0.0" \
    PORT="8080"
WORKDIR /app
# Nitro traces the server's dependencies (takumi's native binary included) into .output.
COPY --from=builder --chown=node:node /app/apps/docs/.output/ ./.output/
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
