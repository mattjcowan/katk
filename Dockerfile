# syntax=docker/dockerfile:1

# ---- deps: install node_modules (compiles better-sqlite3's native addon) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Prefer a reproducible ci install; fall back to install when the lockfile can't
# resolve platform-optional native/wasm deps (e.g. Tailwind oxide's @emnapi/*).
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- build: produce the standalone server ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal runtime image, non-root ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    KATK_DATA_DIR=/data
# Standalone bundle = server.js + only the traced node_modules (incl. better-sqlite3).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Persistent data (app.db + per-user DBs) is mounted here, owned by the node user.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
