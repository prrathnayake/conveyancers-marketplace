#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR"

# Some versions of Docker Compose resolve bind-mount paths relative to the
# working directory instead of the compose file. This results in certificates
# being written to a sibling `tls/` folder at the repository root when the
# stack is started. Automatically migrate those files back into infra/tls so
# developers do not have to clean things up manually.
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LEGACY_TLS_DIR="$PROJECT_ROOT/../tls"
if [ -d "$LEGACY_TLS_DIR" ]; then
  for asset in dev.crt dev.key; do
    if [ -f "$LEGACY_TLS_DIR/$asset" ] && [ ! -f "$SCRIPT_DIR/$asset" ]; then
      mv "$LEGACY_TLS_DIR/$asset" "$SCRIPT_DIR/$asset"
    fi
  done
  rmdir "$LEGACY_TLS_DIR" 2>/dev/null || true
fi

cd "$SCRIPT_DIR"
umask 077
cat > dev.cnf <<'EOF'
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = AU
ST = VIC
L = Melbourne
O = Convey
OU = Dev
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = admin.localhost
DNS.3 = api.localhost
EOF

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout dev.key -out dev.crt \
  -config dev.cnf -extensions v3_req
rm -f dev.cnf
echo "Generated dev certs in infra/tls"
