# syntax=docker/dockerfile:1.7
#
# Pimlico's local account-abstraction helpers, pinned:
# - `deployer`: deploys EntryPoint v0.6, v0.8 and the v0.7 simulations contract that alto and the
#   mock paymaster expect (mock-aa-environment's contract deployer, at a fixed commit and its lockfile).
# - `paymaster`: an ERC-7677 paymaster that sponsors every UserOperation (@pimlico/mock-paymaster).

ARG NODE_IMAGE=docker.io/library/node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

FROM ${NODE_IMAGE} AS deployer
RUN apk add --no-cache git
WORKDIR /app
ADD https://github.com/pimlicolabs/mock-aa-environment.git#ab0e32d160ed5946d2aa386c478d0f57ad449937 /src
RUN cp -r /src/mock-contract-deployer/. . && npm ci --no-audit --no-fund
CMD ["npx", "tsx", "src/index.ts"]

FROM ${NODE_IMAGE} AS paymaster
WORKDIR /app
RUN npm init -y >/dev/null \
    && npm install --no-audit --no-fund --save-exact @pimlico/mock-paymaster@0.0.8 prool@0.0.25 viem@2.57.20
COPY paymaster.mjs .
CMD ["node", "paymaster.mjs"]
