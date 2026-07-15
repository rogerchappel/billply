import { accessSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  accessSync(new URL(`../${target}`, import.meta.url));
  console.log(`verified bin ${name} -> ${target}`);
}

for (const entry of ['dist', 'docs', 'examples', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md']) {
  if (!pkg.files?.includes(entry)) {
    throw new Error(`package files allowlist is missing ${entry}`);
  }
}

for (const path of ['../examples/billply.yaml', '../docs/release-readiness.md']) {
  accessSync(new URL(path, import.meta.url));
}

for (const field of ['repository', 'bugs', 'homepage', 'license']) {
  if (!pkg[field]) {
    throw new Error(`package metadata is missing ${field}`);
  }
}

const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
const [pack] = JSON.parse(packOutput);
const packedFiles = new Set(pack.files.map(file => file.path));

for (const file of [
  'dist/cli.js',
  'dist/index.js',
  'docs/release-readiness.md',
  'examples/billply.yaml',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
]) {
  if (!packedFiles.has(file)) {
    throw new Error(`package tarball is missing ${file}`);
  }
}

console.log(`verified package metadata, examples, files allowlist, and ${pack.filename} contents`);
