# quappe-service — multi-stage build → standalone Node server (adapter-node).
#
# Native deps (better-sqlite3) are compiled INSIDE the image for linux/x64 so the
# prebuilt binding matches the runtime. Never copy host node_modules in (see
# .dockerignore) — a macOS/arm build of better-sqlite3 won't load here.

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for compiling better-sqlite3's native addon.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# --ignore-scripts: the `prepare` hook needs project files not copied yet.
# We build better-sqlite3 explicitly in the runtime stage's node_modules below.
RUN npm ci --ignore-scripts

COPY . .
# paraglide compile + sync + build. Then rebuild the native addon against this
# platform, and prune dev deps (keeps the compiled better_sqlite3.node).
RUN npm run paraglide:compile \
	&& npx svelte-kit sync \
	&& npm run build \
	&& npm rebuild better-sqlite3 \
	&& npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV QUAPPE_DB_PATH=/data/quappe.db
# Embedding-model cache lives on the data volume so it survives restarts.
ENV TRANSFORMERS_CACHE=/data/.cache/transformers

COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json

# Persist SQLite DB + model cache.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000
CMD ["node", "build"]
