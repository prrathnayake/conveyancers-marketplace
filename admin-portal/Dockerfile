# syntax=docker/dockerfile:1

FROM node:20.11-alpine3.18 AS base

USER root
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++
COPY admin-portal/package.json admin-portal/package-lock.json ./admin-portal/
WORKDIR /workspace/admin-portal
RUN npm ci

FROM base AS builder
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++
WORKDIR /workspace/admin-portal
COPY --from=deps /workspace/admin-portal/node_modules ./node_modules
COPY admin-portal ./
COPY frontend ./../frontend
COPY tooling ./../tooling
# Share admin-portal dependencies with the imported frontend code so TypeScript
# can resolve modules like `pg` during the Next.js build.
RUN ln -sfn ../admin-portal/node_modules ../frontend/node_modules
RUN npm run build && npm prune --omit=dev

FROM base AS runner
WORKDIR /workspace/admin-portal
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# hadolint ignore=DL3018
RUN apk add --no-cache dumb-init libstdc++ curl
COPY --from=builder --chown=node:node /workspace/admin-portal/public ./public
COPY --from=builder --chown=node:node /workspace/admin-portal/.next ./.next
COPY --from=builder --chown=node:node /workspace/admin-portal/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/admin-portal/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/admin-portal/next.config.js ./next.config.js
COPY --from=builder --chown=node:node /workspace/admin-portal/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /workspace/frontend ./../frontend
COPY --from=builder --chown=node:node /workspace/tooling ./../tooling
# Recreate the dependency link in the runtime image for consistency.
RUN ln -sfn ../admin-portal/node_modules ../frontend/node_modules
RUN mkdir -p ../data && chown node:node ../data
EXPOSE 4300
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4300/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "start"]
