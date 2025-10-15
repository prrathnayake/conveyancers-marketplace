# Deploying to Production (outline)
- Use managed Postgres (HA), Redis, S3 (onshore region), object lock for legal-hold buckets.
- Terminate TLS at Nginx with real certificates (Let's Encrypt / ACM). 
- Configure WAF rules, rate limits, device fingerprinting.
- Set `FRONTEND_PUBLIC_URL`, `API_PUBLIC_URL`, and vendor webhook URLs.
- Rotate JWT/Encrypt keys via secrets manager. 
- Enable SIEM shipping from Loki/Promtail; alerting in Prometheus/Grafana.
- Regular **DR tests**: snapshot restore from S3 to a staging VPC.
