# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY frontend ./
COPY tooling /tooling
ENV NODE_ENV=production
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# Expose the port Next.js listens on
EXPOSE 3000

# Copy only the runtime assets to keep the image leaner
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /tooling /tooling

CMD ["npm", "run", "start"]
