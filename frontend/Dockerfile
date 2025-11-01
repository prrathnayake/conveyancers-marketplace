# syntax=docker/dockerfile:1

FROM node:20.11-alpine3.18 AS base

# Ensure predictable UID/GID for the application user.
USER root
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000 \
    npm_config_registry="https://registry.npmjs.org"

FROM base AS deps
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --prefer-offline

FROM base AS builder
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY frontend ./
COPY tooling /tooling
ENV NODE_ENV=production
RUN npm run build && npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0

# Expose the port Next.js listens on
EXPOSE 3000

# hadolint ignore=DL3018
RUN apk add --no-cache dumb-init libstdc++ curl

# Copy only the runtime assets to keep the image leaner
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /tooling /tooling

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD nc -z 127.0.0.1 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "start"]
