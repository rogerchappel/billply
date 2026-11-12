import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const path = '.github/workflows/ci.yml';
const original = readFileSync(path, 'utf8');

function verify(workflow) {
  writeFileSync(path, workflow);
  try {
    return spawnSync(process.execPath, ['scripts/verify-ci-workflow.mjs'], { encoding: 'utf8' });
  } finally {
    writeFileSync(path, original);
  }
}

test('CI workflow contract accepts the current workflow', () => {
  const result = verify(original);
  assert.equal(result.status, 0, result.stderr);
});

test('CI workflow contract rejects removed required setup and verification steps', () => {
  const mutations = [
    original.replace('node-version: [20, 24]', 'node-version: [20]'),
    original.replace('version: 9.15.0', 'version: 9.14.0'),
    original.replace('run: corepack prepare pnpm@9.15.0 --activate', 'run: echo skip'),
    original.replaceAll('pnpm install --frozen-lockfile', 'pnpm install'),
    original.replace('run: bash scripts/validate.sh', 'run: echo skip'),
    original.replace('pnpm run package:smoke --if-present', 'echo omitted'),
    original.replace('npm ci', 'npm install'),
    original.replace('pnpm run check --if-present', 'pnpm run lint --if-present'),
    original.replace('pnpm run release:check', 'pnpm run lint'),
    original.replace('pnpm test --if-present', 'pnpm run lint --if-present'),
    original.replace('pnpm run build --if-present', 'pnpm run lint --if-present'),
    original.replace('pnpm run smoke --if-present', 'pnpm run lint --if-present'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    assert.notEqual(mutation, original);
    const result = verify(mutation);
    assert.notEqual(result.status, 0, `mutation ${index}: ${result.stderr}`);
  }
});
