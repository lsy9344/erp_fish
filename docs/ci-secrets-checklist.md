# CI Secrets Checklist

This CI setup does not require repository secrets for normal quality checks.

## Current Required Secrets

- None.

## If Deployment Is Added Later

Add secrets in GitHub:

1. Repository `Settings`
2. `Secrets and variables`
3. `Actions`
4. `New repository secret`

Common future secrets:

- `DATABASE_URL` for staging or production deploy jobs
- `AUTH_SECRET` for deployed environments
- Hosting provider tokens
- Slack webhook URL for notifications

Do not put real passwords or tokens directly in `.github/workflows/ci.yml`.
