# Development TLS Certificates

The development stack expects self-signed TLS assets in this folder. To avoid committing
private keys, the certificate and key are generated locally and ignored by Git. When you
run `docker compose up` the nginx service now bootstraps the certificates automatically
if they are missing, so in most cases no manual action is required.

```bash
bash infra/tls/dev_certs.sh
```

Running the script will create (or rotate) `dev.crt` and `dev.key` with `localhost` as
the common name. This can be useful if you want to regenerate them without recreating
the containers.
