import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

const unsupportedLockfiles = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "bun.lock", "bun.lockb"];
const presentUnsupported = unsupportedLockfiles.filter(existsSync);
if (presentUnsupported.length > 0) {
  throw new Error(`pnpm is the only supported package manager; remove: ${presentUnsupported.join(", ")}`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.packageManager !== "pnpm@9.15.0") {
  throw new Error('package.json must declare "packageManager": "pnpm@9.15.0"');
}
if (!existsSync("pnpm-lock.yaml")) throw new Error("pnpm-lock.yaml is required");

const importer = parse(readFileSync("pnpm-lock.yaml", "utf8")).importers?.["."];
if (!importer) throw new Error("pnpm-lock.yaml is missing its root importer");

for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const manifestDependencies = packageJson[section] ?? {};
  const lockedDependencies = importer[section] ?? {};
  for (const [name, specifier] of Object.entries(manifestDependencies)) {
    if (lockedDependencies[name]?.specifier !== specifier) {
      throw new Error(`${section}.${name} is ${specifier} in package.json but ${lockedDependencies[name]?.specifier ?? "missing"} in pnpm-lock.yaml`);
    }
  }
  const unexpected = Object.keys(lockedDependencies).filter((name) => !(name in manifestDependencies));
  if (unexpected.length > 0) throw new Error(`pnpm-lock.yaml has unexpected ${section}: ${unexpected.join(", ")}`);
}

console.log("Package-manager policy and pnpm lockfile are consistent.");
