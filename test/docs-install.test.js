import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const verifier = join(repoRoot, 'scripts/verify-docs-install.mjs');
const source = readFileSync(verifier, 'utf8');

function runVerifier(readme) {
  const root = mkdtempSync(join(tmpdir(), 'billply-docs-verifier-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/verify-docs-install.mjs'), source);
    writeFileSync(join(root, 'README.md'), readme);
    return spawnSync(process.execPath, [join(root, 'scripts/verify-docs-install.mjs')], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const validReadme = [
  'not currently published to the npm registry',
  'pnpm pack',
  'npm install -g ./billply-0.1.0.tgz',
  'billply --help',
].join('\n');

describe('docs install verifier', () => {
  it('rejects missing README install instructions before packaging', () => {
    const result = runVerifier('install instructions are missing');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /README install instructions are missing: not currently published to the npm registry/);
  });

  it('rejects a README that advertises the unpublished registry package', () => {
    const result = runVerifier(`${validReadme}\nnpm install -g billply\n`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /README presents the unpublished registry package as installable/);
  });
});
