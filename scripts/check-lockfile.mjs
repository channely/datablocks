/**
 * Fails when package-lock.json resolves a package from anywhere other than the public npm
 * registry. Local mirrors rewrite `resolved` URLs on install; committing them breaks `npm ci`
 * on CI runners that cannot reach the mirror.
 */
import { readFileSync } from "node:fs";

const REGISTRY = "https://registry.npmjs.org/";
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const offenders = Object.entries(lock.packages || {})
  .filter(([, entry]) => entry.resolved && !entry.resolved.startsWith(REGISTRY))
  .map(([name, entry]) => `${name || "(root)"} -> ${entry.resolved}`);

if (offenders.length) {
  console.error(`package-lock.json has ${offenders.length} non-registry URL(s):`);
  for (const line of offenders.slice(0, 20)) console.error(`  ${line}`);
  console.error(`Rewrite them to ${REGISTRY} before committing.`);
  process.exit(1);
}
console.log("package-lock.json resolves every package from the public npm registry.");
