import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const required = [
  ['read-only workflow permissions', /^permissions:\s*\n  contents: read\s*$/m],
  ['Node version matrix', /^        node-version: \[20, 24\]$/m],
  ['pnpm action setup', /^      - name: Set up pnpm\n        uses: pnpm\/action-setup@v\d+\n        with:\n          version: 9\.15\.0$/m],
  ['Node action uses the matrix and pnpm cache', /^      - name: Set up Node\.js\n        uses: actions\/setup-node@v\d+\n        with:\n          node-version: \$\{\{ matrix\.node-version \}\}\n          cache: pnpm$/m],
  ['declared pnpm activation', /^      - name: Activate the declared pnpm version\n        run: corepack prepare pnpm@9\.15\.0 --activate$/m],
  ['frozen pnpm install', /^      - name: Install dependencies\n        if: hashFiles\('package\.json'\) != ''\n        run: pnpm install --frozen-lockfile$/m],
  ['package-manager policy check', /^      - name: Validate package-manager policy\n        if: hashFiles\('package\.json'\) != ''\n        run: pnpm lockfile:check$/m],
  ['local validation invocation', /^      - name: Run local validation\n        if: hashFiles\('scripts\/validate\.sh'\) != ''\n        run: bash scripts\/validate\.sh$/m],
  ['package verification invocation', /^      - name: Run package verification\n        run: \|\n          set -euo pipefail\n/m],
];

for (const [description, pattern] of required) {
  if (!pattern.test(workflow)) {
    console.error(`CI workflow is missing or has drifted from required structure: ${description}`);
    process.exitCode = 1;
  }
}

const verification = workflow.split('      - name: Run package verification\n')[1] ?? '';
for (const command of ['release:check', 'check --if-present', 'test --if-present', 'build --if-present', 'smoke --if-present', 'package:smoke --if-present']) {
  if (!verification.includes(command)) {
    console.error(`CI package verification is missing required check: ${command}`);
    process.exitCode = 1;
  }
}
if (!workflow.includes('run: pnpm install --frozen-lockfile') || !verification.includes('npm ci')) {
  console.error('CI workflow must retain frozen pnpm and npm clean-install paths');
  process.exitCode = 1;
}
