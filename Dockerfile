# ============================================================================
# SchoolDesk — production image (Next.js 16 standalone + Prisma 6 + SQLite)
#
# Multi-stage build:
#   deps    → install all deps, generate the Prisma client
#   builder → compile the app (standalone output), bundle the seed script,
#             prune node_modules to production-only
#   runner  → minimal runtime: standalone server + prisma CLI for bootstrap
#
# NOTE: the repo's `npm run start` invokes Bun, which is not available in the
# official Node image. The container therefore runs the Next.js standalone
# server directly with Node (`node server.js`) — identical behaviour, no Bun.
# ============================================================================

# ---- base ------------------------------------------------------------------
FROM node:20-alpine AS base
# openssl: required by Prisma engines on Alpine (musl)
# libc6-compat: recommended for Next.js/swc native binaries on Alpine
RUN apk add --no-cache openssl libc6-compat

# ---- deps ------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# No package-lock.json in the repo (Bun lockfile only) → npm install, not npm ci
COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

# ---- builder ---------------------------------------------------------------
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder so Prisma tooling can resolve env("DATABASE_URL") at build time
ENV DATABASE_URL="file:/tmp/build-placeholder.db"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `npm run build` = `next build` + copies .next/static and public/ into
# .next/standalone/ (script defined in package.json).
# Then: bundle the TypeScript seed into a plain .cjs Node can run in the
# runtime stage without a TS loader (--packages=external keeps prisma/argon2
# resolved from node_modules at runtime), and drop devDependencies
# (typescript, tailwind, eslint, …) — keeping the production tree incl. the
# `prisma` CLI used by the entrypoint.
RUN npm run build \
 && npx --yes esbuild@0.24.0 prisma/seed.ts \
      --bundle --platform=node --format=cjs --packages=external \
      --outfile=prisma/seed.cjs \
 && npm prune --omit=dev

# ---- runner ----------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Environment placeholders — override at runtime (docker-compose / env file)
ENV DATABASE_URL="file:/app/db/custom.db" \
    SD_JWT_ACCESS_SECRET="change-me-in-production" \
    SEED_DEMO_DATA="1"

# uid 1000 matches the typical first user on Linux hosts, so the bind-mounted
# ./db volume is writable by the container user without a manual chown.
RUN addgroup --system --gid 1000 nodejs \
 && adduser  --system --uid 1000 nextjs

# 1) Standalone server (includes its own traced node_modules, server.js,
#    plus .next/static and public/ already embedded by the build script)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 2) Belt-and-braces static assets (no-ops when the build script already
#    copied them)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 3) Full production node_modules overlay — the standalone trace does not
#    include the `prisma` CLI, which the entrypoint needs for `db push`
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# 4) Prisma schema + bundled seed for the runtime bootstrap
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 5) Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/db /app/backups \
 && chown -R nextjs:nodejs /app/db /app/backups

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
