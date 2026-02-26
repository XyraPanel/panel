# Build
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

WORKDIR /app

# fetch from pnpm-lock.yaml only
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

# install from the fetched store
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline

COPY . .

# Generate PWA assets before building
RUN pnpm run generate-pwa-assets

RUN NODE_OPTIONS="--max-old-space-size=6144" pnpm build

# Production
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.source="https://github.com/XyraPanel/panel"
LABEL org.opencontainers.image.description="XyraPanel — open-source game server management panel"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

RUN npm install pm2@5.4.3 -g

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 xyra && \
    adduser --system --uid 1001 xyra

COPY --from=builder --chown=xyra:xyra /app/.output ./.output
COPY --from=builder --chown=xyra:xyra /app/ecosystem.config.cjs ./ecosystem.config.cjs
COPY --from=builder --chown=xyra:xyra /app/server/database/migrations ./migrations

EXPOSE 3000

USER xyra

CMD ["pm2-runtime", "ecosystem.config.cjs"]