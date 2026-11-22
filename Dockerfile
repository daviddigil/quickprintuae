# syntax=docker/dockerfile:1.7
# QuickPrint UAE (Powered by Nexsofture Tech) — production image (Next.js standalone + bundled migrate/seed scripts)

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
RUN mkdir -p public && npm run build \
 && npx esbuild scripts/migrate.ts scripts/seed.ts --bundle --platform=node --target=node22 \
      --format=cjs --tsconfig=tsconfig.json --outdir=dist-scripts --log-level=warning

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    MIGRATIONS_DIR=/app/drizzle
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist-scripts ./dist-scripts
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER app
EXPOSE 3000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]

LABEL org.opencontainers.image.title="QuickPrint UAE" org.opencontainers.image.vendor="Nexsofture Tech" org.opencontainers.image.description="Print-on-demand platform. Powered by Nexsofture Tech"
