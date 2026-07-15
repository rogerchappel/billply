import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

function runCli(args) {
  // Try pnpm exec tsx first (dev), fall back to npx tsx (CI)
  const cmds = [
    `pnpm exec tsx src/cli.ts ${args}`,
    `npx tsx src/cli.ts ${args}`,
    `node --import tsx src/cli.ts ${args}`,
  ];
  for (const cmd of cmds) {
    try {
      return { out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }), stderr: '' };
    } catch (e) {
      if (e.stderr && (e.stderr.includes('ERR_MODULE_NOT_FOUND') || e.stderr.includes('not found'))) {
        continue;
      }
      return { out: e.stdout || '', stderr: e.stderr || String(e.message) };
    }
  }
  throw new Error('No working CLI runner found');
}

describe('billply smoke', () => {
  it('plans the example config without destructive changes', () => {
    const { out, stderr } = runCli('plan --config examples/billply.yaml');

    assert.equal(stderr, '');
    assert.match(out, /Configure customer portal for LeadFinder AI/);
    assert.match(out, /Create monthly recurring price \$99\.00 for Pro/);
    assert.match(out, /No destructive changes/);
  });

  it('verifies and exports deterministic fixture values', () => {
    const verify = runCli('verify --config examples/billply.yaml');
    assert.equal(verify.stderr, '');
    assert.match(verify.out, /Config valid/);

    const exported = runCli('export --config examples/billply.yaml');
    assert.equal(exported.stderr, '');
    assert.match(exported.out, /STRIPE_LEADFINDER_ACCOUNT_ID=acct_xxx/);
    assert.match(exported.out, /STRIPE_LEADFINDER_AI_PRO_MONTHLY_LOOKUP_KEY=leadfinder-ai-pro-monthly/);
  });
});
