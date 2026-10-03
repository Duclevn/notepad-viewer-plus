import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  console.error("Usage: node packaging/sync-version.mjs --write|--check");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = join(root, "version.json");
const packageFile = join(root, "renderer", "package.json");
const lockFile = join(root, "renderer", "package-lock.json");
const installerTemplateFile = join(root, "packaging", "installer-wrapper.ps1.in");
const installerClickTemplateFile = join(root, "packaging", "installer-click-wrapper.cmd.in");
const canonical = JSON.parse(readFileSync(versionFile, "utf8"));
const version = canonical.version;
if (Object.keys(canonical).length !== 1 || !/^\d+\.\d+\.\d+$/u.test(version)) {
  throw new Error('version.json must have the exact shape { "version": "x.y.z" }');
}

const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
const packageLock = JSON.parse(readFileSync(lockFile, "utf8"));
const observed = [
  ["renderer/package.json", packageJson.version],
  ["renderer/package-lock.json", packageLock.version],
  ["renderer/package-lock.json packages['']", packageLock.packages?.[""]?.version]
];
const installerFile = join(root, `Install-NotepadViewerPlus-${version}.ps1`);
const expectedInstaller = readFileSync(installerTemplateFile, "utf8").replaceAll("@VERSION@", version);
const installerClickFile = join(root, `Install-NotepadViewerPlus-${version}.cmd`);
const expectedInstallerClick = readFileSync(installerClickTemplateFile, "utf8").replaceAll("@VERSION@", version);
const normalizeLines = (value) => value.replaceAll("\r\n", "\n");

if (mode === "--check") {
  const mismatches = observed.filter(([, candidate]) => candidate !== version);
  if (mismatches.length > 0) {
    for (const [name, candidate] of mismatches) {
      console.error(`${name} has version ${candidate ?? "<missing>"}; expected ${version}`);
    }
  }
  const installerMatches = existsSync(installerFile) &&
    normalizeLines(readFileSync(installerFile, "utf8")) === normalizeLines(expectedInstaller);
  const installerClickMatches = existsSync(installerClickFile) &&
    normalizeLines(readFileSync(installerClickFile, "utf8")) === normalizeLines(expectedInstallerClick);
  if (!installerMatches) console.error(`Installer wrapper is missing or stale: ${installerFile}`);
  if (!installerClickMatches) console.error(`Installer click wrapper is missing or stale: ${installerClickFile}`);
  if (mismatches.length > 0 || !installerMatches || !installerClickMatches) process.exit(1);
  console.log(`Renderer metadata and installer wrappers match ${version}`);
  process.exit(0);
}

packageJson.version = version;
packageLock.version = version;
if (!packageLock.packages?.[""]) throw new Error("package-lock.json is missing packages['']");
packageLock.packages[""].version = version;
writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(lockFile, `${JSON.stringify(packageLock, null, 2)}\n`);
writeFileSync(installerFile, expectedInstaller);
writeFileSync(installerClickFile, expectedInstallerClick);
console.log(`Updated renderer package metadata and installer wrappers to ${version}`);
