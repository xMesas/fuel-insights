# Going live (phase 8): the plan

The production stack already runs locally (`compose.prod.yaml`, 43-check smoke test). Going live moves the same
Compose stack to one AWS server, adds HTTPS, backups, email and alarms, and deploys it from GitHub Actions. Nothing
here is applied yet: it needs an AWS account, a domain and the owner's go-ahead for anything that costs money.

## Architecture

```
GitHub Actions ──OIDC──▶ AWS (eu-west-1)
  build arm64 images ─▶ ECR (backend, web, ssr)
  deploy ─────────────▶ SSM Run Command ─▶ EC2 t4g.small (Docker Compose)
                                              caddy :443/:80  ──▶ nginx (web) ──▶ ssr (Node)
                                                                         └──▶ backend (Spring) ──▶ postgres (EBS)
                                              daily pg_dump ──▶ S3 (versioned, 30 days)
  SES (sign-in and alert emails)   Route 53 or registrar DNS   Budgets alarm   CloudWatch status alarm
```

- **One server, not a cluster:** the site is small and stateless apart from PostgreSQL. Compose on one instance is the
  stack already tested; managed services such as RDS (about 15 €/month more) or ECS come when traffic asks for them.
- **eu-west-1 (Ireland):** every service needed (SES included) and good latency to Spain; the privacy policy names
  "Irlanda o Fráncfort".
- **t4g.small (2 vCPU, 2 GiB, ARM):** the cheapest size that fits. Measured budgets: backend 1 GiB, SSR 512 MiB, PostgreSQL and nginx the rest, plus a
  2 GiB swap file. Images are built for `linux/arm64` (Temurin, Node and nginx all publish arm64).
- **HTTPS with Caddy:** a small container in front that gets and renews Let's Encrypt certificates by itself. nginx
  keeps the cache, the CSP and the request limits. An ALB with ACM would cost about 18 €/month more.
- **No SSH:** the security group opens only 80 and 443; administration goes through SSM Session Manager.

## Terraform layout (`infra/terraform/`)

| File | What |
|---|---|
| `bootstrap/` | S3 bucket for the Terraform state (versioned, native S3 locking), applied once by hand |
| `main.tf`, `variables.tf`, `outputs.tf` | provider, region, domain, instance size |
| `network.tf` | default VPC, security group 80/443, Elastic IP |
| `ec2.tf` | the instance (Amazon Linux 2023 arm64), 30 GB gp3, IAM role for SSM, ECR pull and S3 backups; user data installs Docker and the swap file |
| `ecr.tf` | three repositories, scan on push, lifecycle keeping the last 10 images |
| `github-oidc.tf` | OIDC provider and a deploy role limited to this repository's `main` branch: push to ECR and run one SSM document |
| `backups.tf` | S3 bucket (versioning, 30-day lifecycle, no public access) |
| `ses.tf` | domain identity, DKIM records, a MAIL FROM domain |
| `dns.tf` | A record and SES records (only if the domain is in Route 53) |
| `alarms.tf` | AWS Budgets at 25 €/month (email), CloudWatch alarm on failed status checks with auto-recovery |

Checks before any `apply`: `terraform fmt -check`, `terraform validate`, `tflint` and `checkov` in CI, and a
`terraform plan` the owner reads.

## Deploy (GitHub Actions)

1. On every push to `main`, the current CI job runs: backend `verify`, web tests and build, and the smoke test.
2. A deploy job (OIDC, no stored AWS keys) builds the arm64 images with `buildx`, tags them with the commit SHA and
   pushes them to ECR.
3. It runs an SSM document on the instance that:
   - writes `.env` with the image tags;
   - renders the secrets from SSM Parameter Store into `secrets/`;
   - runs `docker compose pull && docker compose up -d --wait`.
4. It checks `https://<domain>/` and `/sitemap.xml`. On failure, it redeploys the previous tags.

## Secrets (SSM Parameter Store, SecureString)

| Parameter | Use |
|---|---|
| `db_password`, `db_admin_password` | PostgreSQL |
| `signing_key` | unsubscribe links |
| `mail_username`, `mail_password` | SES SMTP |
| `stripe_secret_key`, `stripe_webhook_secret`, `stripe_price_id` | the ad-free plan, once Stripe is live |

None of them in git, in GitHub variables or in the Terraform state (created with `aws ssm put-parameter`, read
only by the instance role).

## Backups and restore

- `pg_dump -Fc` every night at 03:30 into the S3 bucket (systemd timer on the instance), kept 30 days.
- **Restore drill**, once a month and before calling the phase done:
  1. restore the latest dump into a throwaway PostgreSQL container;
  2. compare row counts of `price_daily`, `station`, `app_user` and `subscription`;
  3. write the date and result in `docs/operations.md`.

## Email (SES)

1. Verify the domain: DKIM CNAMEs, SPF `include:amazonses.com`, DMARC `p=none` at first, then `quarantine`.
2. Ask AWS to leave the SES sandbox; it is a short form and takes about a day.
3. Create SMTP credentials and set `MAIL_HOST`, `MAIL_PORT` and the user and password secrets; `mail-from` becomes
   `avisos@<domain>`.

## Monthly cost (estimate, before new-account credits)

| Item | € |
|---|---|
| EC2 t4g.small | ~12.5 |
| EBS 30 GB gp3 | ~2.5 |
| Public IPv4 (Elastic IP) | ~3.4 |
| S3 backups, ECR images | ~1 |
| Route 53 zone (optional) | ~0.5 |
| SES | ~0.1 per 1,000 emails |
| **Total** | **~20** |

## What the owner does

1. Create the AWS account: MFA on the root user, an admin user with IAM Identity Center (SSO), and AWS Budgets.
2. Buy the `.es` domain and choose the name (see the private brand kit).
3. Configure `aws configure sso` locally, so Terraform runs with short-lived credentials.
4. Read and approve each `terraform plan`: nothing that costs money is applied without an explicit yes.
5. Fill in the legal pages (`docs/legal/*.md`) and register the site in Google Search Console after the first
   deploy.
