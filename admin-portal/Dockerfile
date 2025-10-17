# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY admin-portal/package.json admin-portal/package-lock.json ./admin-portal/
WORKDIR /workspace/admin-portal
RUN npm ci

FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /workspace/admin-portal
COPY --from=deps /workspace/admin-portal/node_modules ./node_modules
COPY admin-portal ./
COPY frontend ./../frontend
COPY tooling ./../tooling
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /workspace/admin-portal
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libstdc++
COPY --from=builder /workspace/admin-portal/public ./public
COPY --from=builder /workspace/admin-portal/.next ./.next
COPY --from=builder /workspace/admin-portal/node_modules ./node_modules
COPY --from=builder /workspace/admin-portal/package.json ./package.json
COPY --from=builder /workspace/admin-portal/next.config.js ./next.config.js
COPY --from=builder /workspace/admin-portal/tsconfig.json ./tsconfig.json
COPY --from=builder /workspace/frontend ./../frontend
COPY --from=builder /workspace/tooling ./../tooling
RUN mkdir -p ../frontend/data
EXPOSE 4300
CMD ["npm", "run", "start"]
