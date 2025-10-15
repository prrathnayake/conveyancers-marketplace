#!/usr/bin/env bash
set -e
mkdir -p "$(dirname $0)"
cd "$(dirname $0)"
openssl req -x509 -nodes -days 365 -newkey rsa:2048   -keyout dev.key -out dev.crt -subj "/C=AU/ST=VIC/L=Melbourne/O=Convey/OU=Dev/CN=localhost"
echo "Generated dev certs in infra/tls"
