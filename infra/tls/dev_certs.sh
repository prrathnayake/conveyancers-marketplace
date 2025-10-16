#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR"
cd "$SCRIPT_DIR"
umask 077
openssl req -x509 -nodes -days 365 -newkey rsa:2048   -keyout dev.key -out dev.crt -subj "/C=AU/ST=VIC/L=Melbourne/O=Convey/OU=Dev/CN=localhost"
echo "Generated dev certs in infra/tls"
