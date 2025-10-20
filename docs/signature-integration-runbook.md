# Signature integration runbook

This runbook documents the manual checks we perform whenever the e-signature
vendor configuration changes or we deploy a new build. It covers envelope
creation, signer completion, and certificate hashing.

## 1. Pre-requisites

1. Export the vendor credentials into your shell (values come from the secrets
   manager in production):

   ```bash
   export ESIGN_PROVIDER="production"
   export ESIGN_VENDOR_BASE_URL="https://api.vendor.example"
   export ESIGN_VENDOR_API_KEY="<api-key>"
   export ESIGN_VENDOR_API_SECRET="<api-secret>"
   export ESIGN_VENDOR_ACCOUNT_ID="<account-id>"   # optional for multi-tenant setups
   export ESIGN_VENDOR_API_PREFIX="/v1"
   export ESIGN_WEBHOOK_SECRET="<webhook-secret>"
   ```

2. Ensure the application can reach the jobs service and the e-sign vendor.
   The health check endpoint should return a `200`:

   ```bash
   curl -sf "${JOBS_SERVICE_URL}/health"
   ```

## 2. Envelope creation

1. Trigger an envelope from the admin portal API (replace identifiers with a
   test record):

   ```bash
   curl -X POST "${NEXT_PUBLIC_ADMIN_PORTAL_URL}/api/signatures" \
     -H "Content-Type: application/json" \
     -d '{
       "jobId": "job_123",
       "documentId": "doc_456",
       "signers": [
         { "name": "Test Signer", "email": "signer@example.com" }
       ]
     }'
   ```

2. Confirm the response contains a non-mock provider ID and a `status` of
   `sent`. Verify the audit trail entry via:

   ```bash
   curl "${NEXT_PUBLIC_ADMIN_PORTAL_URL}/api/signatures?id=<envelope-id>&audit=true"
   ```

## 3. Signer completion

1. Use the vendor dashboard to complete the envelope as the test signer.

2. Call the sync endpoint to pull the latest status:

   ```bash
   curl -X PUT "${NEXT_PUBLIC_ADMIN_PORTAL_URL}/api/signatures" \
     -H "Content-Type: application/json" \
     -d '{ "id": "<envelope-id>" }'
   ```

3. Confirm the response marks the signer as completed and the signature record
   moves to `signed`.

## 4. Certificate hashing

1. Download the certificate directly from the vendor for the test envelope.
2. Compute the SHA-256 hash locally and compare it with the
   `certificateHash` stored on the signature record:

   ```bash
   curl "${NEXT_PUBLIC_ADMIN_PORTAL_URL}/api/signatures?id=<envelope-id>" \
     | jq -r '.certificateHash' > /tmp/app_hash

   sha256sum /path/to/vendor/certificate.pdf | awk '{print $1}' > /tmp/vendor_hash
   diff /tmp/app_hash /tmp/vendor_hash
   ```

3. If the hashes differ, raise an incident and disable completions until the
   discrepancy is resolved.

## 5. Webhook verification

1. Capture the latest webhook payload and signature from the vendor.
2. Recompute the signature locally:

   ```bash
   printf '%s' '<raw-payload>' \
     | node - <<'JS'
   const crypto = require('crypto')
   const chunks = []
   process.stdin.on('data', (chunk) => chunks.push(chunk))
   process.stdin.on('end', () => {
     const payload = Buffer.concat(chunks)
     const signature = crypto.createHmac('sha256', process.env.ESIGN_WEBHOOK_SECRET).update(payload).digest('hex')
     console.log(signature)
   })
   JS
   ```

3. Match the output to the vendor header before re-enabling webhooks.

## 6. Incident response

- Roll back to the mock provider only in staging environments.
- In production, failing to configure the vendor now raises
  `esign_provider_not_configured.*` errors, preventing silent fallbacks.
- Document any mitigation steps in the signature audit log for traceability.
