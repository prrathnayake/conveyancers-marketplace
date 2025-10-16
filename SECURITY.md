# Security Policy

## Supported versions

Security fixes are applied to the `main` branch. Downstream consumers should track `main` or the latest tagged release.

| Version | Supported |
|---------|-----------|
| main    | ✅ |

## Reporting a vulnerability

We take security concerns seriously. If you discover a vulnerability:

1. **Do not** open a public GitHub issue.
2. Email the maintainers at **security@conveyancers-marketplace.example** with the following details:
   - A clear description of the issue and potential impact.
   - Steps to reproduce, including proof-of-concept code if available.
   - Any mitigation you have already identified.
3. Expect an acknowledgement within 2 business days.
4. We aim to provide an initial assessment and remediation plan within 7 business days.

We request that you keep the report confidential until we release a fix and coordinate public disclosure together.

## Security best practices for deployers

- Rotate API keys, database credentials, and signing certificates regularly.
- Enforce MFA for all administrator accounts and hosting consoles.
- Configure Web Application Firewall (WAF) rules in front of the gateway.
- Enable automated dependency updates and monitor supply-chain advisories.
- Review the [compliance guidance](docs/compliance.md) and regional data retention obligations.

## Hardening checklist

- [ ] Use managed Postgres/Redis services with network isolation.
- [ ] Store object data in region-appropriate buckets with lifecycle policies.
- [ ] Configure TLS certificates from a trusted Certificate Authority.
- [ ] Enable structured logging shipping to a SIEM for long-term retention.
- [ ] Run static analysis (SAST) and dependency scanning in CI/CD pipelines.
- [ ] Perform regular penetration testing and share outcomes with stakeholders.

Thank you for helping us keep the Conveyancers Marketplace ecosystem safe.
