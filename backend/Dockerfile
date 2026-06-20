FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-alpine

# curl is needed by the HEALTHCHECK below
RUN apk add --no-cache curl

WORKDIR /app

# Build-time metadata — injected by CI via --build-arg
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.title="AgentForge Backend" \
      org.opencontainers.image.description="Express API for the AgentForge visual agent builder" \
      org.opencontainers.image.source="https://github.com/Sachin-sehrawat/agent-builder"

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY db/ ./db/

EXPOSE 4000

# Docker will restart the container if two consecutive health checks fail.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -fs http://localhost:4000/api/health | grep '"ok":true' || exit 1

# Tini ensures SIGTERM is forwarded so the process exits cleanly instead of
# being killed after the default 10-second grace period.
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "src/server.js"]
