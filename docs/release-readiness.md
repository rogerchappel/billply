# Release Readiness

Use this checklist before cutting a release or asking a reviewer to trust the package contents.

## Public Package Surface

- Package: `billply`
- Repository: `https://github.com/rogerchappel/billply`
- Published files are controlled by the `files` allowlist in `package.json`.

## CLI Surface

- `billply` -> `./dist/cli.js`

## Verification Commands

- `pnpm check`: `tsc --noEmit`
- `pnpm test`: `pnpm build && node --test test/*.test.js`
- `pnpm build`: `tsc`
- `pnpm smoke`: `pnpm exec tsx src/cli.ts plan --config examples/billply.yaml && pnpm exec tsx src/cli.ts verify --config examples/billply.yaml && pnpm exec tsx src/cli.ts export --config examples/billply.yaml`
- `pnpm run package:smoke`: build, verify the package metadata and dry-run tarball contents, then run `npm pack --dry-run`
- `pnpm run release:check`: `pnpm check && pnpm test && pnpm smoke && pnpm run package:smoke`

Run `pnpm run release:check` when available before opening a release PR. When a command is unavailable, use the closest listed command and record the reason in the PR.

## Reviewer Notes

- Confirm README examples still match the CLI or module exports.
- Confirm `npm pack --dry-run` does not include local fixtures, generated logs, or build caches beyond the intended allowlist.
- Confirm GitHub Actions runs the same install and package smoke path used locally.
