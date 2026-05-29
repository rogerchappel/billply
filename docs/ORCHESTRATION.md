# Orchestration Plan

## Intent

Billply should remain safe by default while making repeatable Stripe setup fast.
Local planning, validation, and export must work without Stripe credentials.
Stripe reads require explicit `--stripe`, and Stripe writes require explicit
`apply --execute`.

## Workstreams

- Repository setup: docs, contributor policy, release readiness, and validation.
- Config model: YAML parsing, validation, and deterministic normalized types.
- Local commands: `plan`, `verify`, `export`, and dry-run-first `apply`.
- Stripe adapter: read current products, prices, portal configurations, and webhooks, then apply guarded idempotent setup.

## Safety Gates

- Do not store API keys in repository files.
- Do not print Stripe API keys or webhook signing secrets.
- Do not mutate Stripe resources unless `apply --execute` is passed.
- Do not use live Stripe keys unless `--live` is passed.
- Do not delete Stripe resources automatically.
- Keep destructive changes out of generated plans unless rollback handling exists.

## Verification

- Run `bash scripts/validate.sh` before opening or updating a pull request.
- Run the CLI smoke commands against `examples/billply.yaml`.
- Keep GitHub Actions aligned with the local validation script.
