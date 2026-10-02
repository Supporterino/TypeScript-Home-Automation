# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Install the full workspace. Dev dependencies (TypeScript, Biome, Changesets)
# are required to compile every package, so this stage does not use --production.
FROM base AS build

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY packages/web-ui/package.json packages/web-ui/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages

# Full workspace build, including @ts-ha/web-ui's asset build (its prebuild
# hook), so every package emits the compiled dist/ the runtime consumes.
RUN bun run build

# Runtime image: runs the compiled CLI. The `development` exports condition is
# not active in-image, so workspace imports resolve to the compiled dist/.
FROM base AS runner

ENV NODE_ENV=production

COPY --from=build /app /app

# Create a writable directory for HomeKit pairing persistence.
# In production mount a volume here (e.g. /data/homekit-persist)
# and set persistPath to an absolute path in your HomekitService options.
RUN mkdir -p /data/homekit-persist

EXPOSE 8080

# No automations ship in the image. Mount an operator-provided directory at
# /app/automations; a missing directory is logged and startup continues.
CMD ["bun", "packages/cli/dist/index.js", "run"]
