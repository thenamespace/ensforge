# syntax=docker/dockerfile:1.7
# Build from the repository root: docker build -f apps/docs/Dockerfile .
#
# Build-time VITE_ variables are passed as a BuildKit secret so they stay out of
# the image history: --secret id=dotenv,env=DOTENV (one KEY=value per line),
# plus --build-arg DOTENV_SHA256=<hash of the value> so changes bust the cache.
# Indexer URLs are read at runtime and belong in the deployment, not here.

FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED="1"
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches/ ./patches/
COPY packages/hca/patches/ ./packages/hca/patches/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile --ignore-scripts
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts
# Secret contents are not part of the layer cache key; pass the dotenv's hash so
# a changed value rebuilds instead of reusing a cached bundle.
ARG DOTENV_SHA256=""
RUN --mount=type=secret,id=dotenv,required=false \
    if [ -f /run/secrets/dotenv ]; then cp /run/secrets/dotenv apps/docs/.env.production; fi \
    && NODE_ENV=production pnpm exec turbo run build --filter=@ensforge/docs... \
    && rm -f apps/docs/.env.production

FROM node:24.18.0-bookworm-slim AS runner
ENV NODE_ENV="production"
ENV HOST="0.0.0.0"
ENV PORT="8080"
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/docs/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "dist/serve-node.js"]
