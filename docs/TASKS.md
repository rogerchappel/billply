# Tasks

## Now

- Scaffold the OSS repository and contributor workflow.
- Implement a non-mutating YAML parser for account, app, product, price, and webhook configuration.
- Implement `billply plan` for local previews.
- Implement `billply verify` for local config reference checks.
- Implement `billply export` for deterministic runtime lookup names.
- Keep `billply apply` disabled until the Stripe adapter has an approved safety design.

## Next

- Define the Stripe adapter interface behind a dry-run-first state engine.
- Add fixture-based tests for portal, checkout, and webhook planning.
- Add schema documentation for `billply.yaml`.
- Add account cloning design notes before touching live Stripe data.

## Later

- Implement Stripe read-only drift detection.
- Add guarded Stripe mutation support with explicit confirmation and rollback notes.
- Add CI examples for drift verification on pull requests.
