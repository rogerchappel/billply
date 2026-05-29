# billply

Infrastructure-as-code CLI for Stripe SaaS billing.

## Status

This repository is early-stage. The first implementation is intentionally
non-mutating: it parses local config, produces plans, validates references, and
exports deterministic runtime names without calling Stripe APIs.

## Install

```sh
pnpm install
pnpm build
```

## Use

Create a `billply.yaml` file:

```yaml
accounts:
  leadfinder:
    account_id: acct_xxx
    environment: test
    api_key_env: STRIPE_LEADFINDER_API_KEY

apps:
  - name: LeadFinder AI
    stripe_account: leadfinder
    support_email: support@leadfinder.ai
    privacy_url: https://leadfinder.ai/privacy
    terms_url: https://leadfinder.ai/terms
    products:
      - name: Starter
        monthly_price: 29
      - name: Pro
        monthly_price: 99
        yearly_price: 990
    webhooks:
      - url: https://leadfinder.ai/api/stripe/webhook
        events:
          - checkout.session.completed
          - customer.subscription.updated
```

Run the local planner:

```sh
pnpm exec tsx src/cli.ts plan --config billply.yaml
pnpm exec tsx src/cli.ts verify --config billply.yaml
pnpm exec tsx src/cli.ts export --config billply.yaml
```

## Verify

Run the local validation script before opening a pull request:

```sh
bash scripts/validate.sh
```

`scripts/validate.sh` runs the repository's standard local checks when they are defined and will also run `agent-qc ready` when `agent-qc` is installed. Missing `agent-qc` is treated as a skip, not a failure.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes
should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance. Replace
the default security policy before publishing the generated repository.

These links assume this README has been copied to the generated repository root.

## License

MIT
