# Single public entry point (reference/implementation.txt Phase 10.4) —
# just Nginx + our config; certs are mounted at runtime (see
# docker-compose.yml), never baked into the image.
FROM nginx:1.27-alpine

# The official image's entrypoint auto-runs envsubst on every
# /etc/nginx/templates/*.template file into /etc/nginx/conf.d/ at
# container start, substituting only names that are actual environment
# variables (nginx's own $host/$request_uri/etc. tokens are left alone) —
# used here so the HTTP->HTTPS redirect can embed the real external HTTPS
# port (see docker-compose.yml's HTTPS_PORT).
COPY proxy/nginx.conf.template /etc/nginx/templates/default.conf.template

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO /dev/null --no-check-certificate https://127.0.0.1/health || exit 1
