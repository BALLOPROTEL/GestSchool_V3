# syntax=docker/dockerfile:1
FROM node:24.20.0-bookworm-slim AS build
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    apt-get update && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && npm install --global pnpm@10.24.0 \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile --prod=false \
    && pnpm --filter @gestschool/worker... build

FROM node:24.20.0-bookworm-slim AS runtime
WORKDIR /app
COPY --chown=node:node --from=build /app /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    node node_modules/@playwright/test/cli.js install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
USER node
CMD ["node", "apps/worker/dist/main.js"]
