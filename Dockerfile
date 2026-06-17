# syntax=docker/dockerfile:1

# ─── deps stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile + manifests only (better layer caching)
COPY package.json pnpm-lock.yaml* ./

# Install all deps (including devDependencies needed for tsx + build)
RUN pnpm install --frozen-lockfile

# ─── builder stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js app (standalone output)
RUN pnpm run build

# ─── runner stage (Next.js web server) ───────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy server automation scripts + their dependencies so pnpm auto:* works
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Default: run the Next.js web server.
# Override CMD in Coolify to run an automation instead, e.g.:
#   CMD ["pnpm", "auto:terracore"]
CMD ["node", "server.js"]
