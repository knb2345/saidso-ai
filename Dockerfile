# Kivi — public demo image.
#
# The seeded database ships inside the image as db/seed.db. At start-up the server copies
# it to KIVI_DB_PATH and re-dates the corpus (src/lib/demo.ts), and does so again every
# UTC midnight, so whatever visitors teach it is temporary. One replica only: SQLite.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Toolchain only as a fallback, in case better-sqlite3 has no prebuilt binary to download.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    KIVI_DB_PATH=/data/kivi.db \
    KIVI_DEMO_SEED=/app/db/seed.db
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/db/migrations ./db/migrations
COPY --from=build /app/db/seed.db ./db/seed.db
COPY --from=build /app/eval ./eval
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
