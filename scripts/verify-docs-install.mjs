import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

for (const text of [
  'not currently published to the npm registry',
  'pnpm pack',
  'npm install -g ./billply-0.1.0.tgz',
  'billply --help',
]) {
  if (!readme.includes(text)) {
    throw new Error(`README install instructions are missing: ${text}`);
  }
}

if (/^npm install -g billply$/m.test(readme)) {
  throw new Error('README presents the unpublished registry package as installable');
}

const scratch = mkdtempSync(join(tmpdir(), 'billply-docs-install-'));

try {
  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], {
    cwd: root,
    encoding: 'utf8',
  });
  const [pack] = JSON.parse(packOutput);
  const tarball = join(scratch, pack.filename);
  const prefix = join(scratch, 'install');

  execFileSync('npm', ['install', '--global', '--prefix', prefix, tarball], {
    cwd: scratch,
    stdio: 'inherit',
  });
  execFileSync(join(prefix, 'bin', 'billply'), ['--help'], {
    cwd: scratch,
    stdio: 'inherit',
  });

  console.log(`verified README install path with ${pack.filename}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
