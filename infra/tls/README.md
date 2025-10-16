# Development TLS Certificates

The development stack expects self-signed TLS assets in this folder. To avoid committing
private keys, the certificate and key are generated locally and ignored by Git.

```bash
bash infra/tls/dev_certs.sh
```

Running the script will create `dev.crt` and `dev.key` with `localhost` as the common
name. Re-run the script whenever you need to rotate the certificates.
