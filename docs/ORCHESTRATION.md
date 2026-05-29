# Orchestration Plan

## Intent

Billply should remain safe by default. Local planning, validation, and export
must work before any Stripe API mutation exists.

## Workstreams

- Repository setup: docs, contributor policy, release readiness, and validation.
- Config model: YAML parsing, validation, and deterministic normalized types.
- Local commands: `plan`, `verify`, `export`, and disabled `apply`.
- Stripe adapter: future read-only discovery first, then guarded mutation.

## Safety Gates

- Do not store API keys in repository files.
- Do not mutate Stripe resources from the MVP planner.
- Do not enable `apply` until a maintainer approves the Stripe adapter design.
- Keep destructive changes out of generated plans unless rollback handling exists.

## Verification

- Run `bash scripts/validate.sh` before opening or updating a pull request.
- Run the CLI smoke commands against `examples/billply.yaml`.
- Keep GitHub Actions aligned with the local validation script.
