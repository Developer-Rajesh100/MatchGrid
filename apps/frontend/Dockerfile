# Built from the REPOSITORY ROOT as the build context (see /.dockerignore):
#   docker build -f apps/frontend/Dockerfile -t matchgrid-web .
# Multi-stage: Bun builds the Vite app, then a slim Nginx serves the static output and proxies
# /api and /ws to the backend. The build stage (and node_modules) never reaches the final image.

FROM oven/bun:1.4 AS build
WORKDIR /app
# Dependencies first so they cache separately from source changes. bun.lock is the lockfile.
COPY package.json bun.lock ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN bun install --frozen-lockfile
COPY apps/frontend apps/frontend
# Optional: bake a cross-origin API into the bundle. Leave empty for the bundled same-origin
# proxy below (the default for Docker Compose).
ARG VITE_API_URL=""
ARG VITE_WS_URL=""
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL
RUN cd apps/frontend && bun run build

FROM nginx:1.27-alpine AS runtime
# nginx renders *.template files with the container's environment at start-up.
ENV API_UPSTREAM=http://backend:8000
COPY apps/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
