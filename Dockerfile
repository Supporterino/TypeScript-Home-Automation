FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY tsconfig.json ./

# Create a writable directory for HomeKit pairing persistence.
# In production mount a volume here (e.g. /data/homekit-persist)
# and set persistPath to an absolute path in your HomekitService options.
RUN mkdir -p /data/homekit-persist

EXPOSE 8080

CMD ["bun", "run", "src/standalone.ts"]
