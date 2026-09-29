#!/bin/sh
# Generates a self-signed TLS certificate for LOCAL TESTING of the reverse
# proxy only — browsers will show a security warning for it, which is
# expected. For a real deployment, replace proxy/certs/fullchain.pem and
# proxy/certs/privkey.pem with real certificates (e.g. from Let's
# Encrypt/certbot) using these same two filenames; nginx.conf doesn't need
# to change either way.
set -e
cd "$(dirname "$0")"
mkdir -p certs
openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout certs/privkey.pem \
    -out certs/fullchain.pem \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "Generated proxy/certs/fullchain.pem and proxy/certs/privkey.pem (self-signed, local testing only)."
