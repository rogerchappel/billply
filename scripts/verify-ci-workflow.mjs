import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const required = [
  /^permissions:\s*\n  contents: read\s*$/m,
  /^      - name: Check out repository$/m,
  /^      - name: Install dependencies$/m,
  /^      - name: Validate package-manager policy$/m,
  /^      - name: Run local validation$/m,
  /^      - name: Run package verification$/m,
];
for (const pattern of required) {
  if (!pattern.test(workflow)) {
    console.error(`CI workflow is missing or has drifted from required structure: ${pattern}`);
    process.exitCode = 1;
  }
}
