# Tasks

## Now

- Scaffold the OSS repository and contributor workflow.
- Implement a non-mutating YAML parser for account, app, product, price, and webhook configuration.
- Implement `billply plan` for local previews.
- Implement `billply verify` for local config reference checks.
- Implement `billply export` for deterministic runtime lookup names.
- Implement guarded Stripe setup for products, prices, customer portal configurations, and webhook endpoints.
- Keep live Stripe writes behind explicit `--execute --live` flags.

## Next

- Add fixture-based tests for portal, checkout, and webhook planning.
- Add schema documentation for `billply.yaml`.
- Add account cloning design notes before touching live Stripe data.

## Later

- Add CI examples for drift verification on pull requests.
- Add account cloning from an existing Stripe account into YAML.
- Add Checkout integration snippets for app runtimes.
