# Built from the project root as the build context (see ../.dockerignore).
# Multi-stage: build the Vite app in a Node stage, then serve the static
# output from a slim Nginx stage — the build stage (and its node_modules)
# never ends up in the final image.

FROM node:20-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
# frontend/public/assets/ (real team/player photos) is copied into dist/
# automatically by `vite build` — no separate COPY needed for it.
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
