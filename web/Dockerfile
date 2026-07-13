# mr-bridge web — self-hosted image (ADR 0017, #476).
#
# Multi-stage so the runtime image carries no toolchain and no source. Relies on
# `output: "standalone"` in next.config.ts, which traces only the node_modules
# actually reachable at runtime — a few hundred MB instead of the whole tree.
#
# Build context is the REPO ROOT (not web/), because the standalone trace is rooted
# at the monorepo root: outputFileTracingRoot = path.join(__dirname, "..").

FROM node:24-alpine AS deps
WORKDIR /app
# sharp needs libc6-compat on alpine; next/image is dead without it off Vercel.
RUN apk add --no-cache libc6-compat
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, not read at
# runtime — so the Supabase URL and anon key must be present here or the browser
# gets `undefined` and every request fails with no obvious cause.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone emits server.js + the traced node_modules. static/ and public/ are
# NOT included in the trace and must be copied explicitly, or every asset 404s.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
