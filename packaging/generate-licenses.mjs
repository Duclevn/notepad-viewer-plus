import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const renderer = resolve(import.meta.dirname, "../renderer");
const nodeModules = join(renderer, "node_modules");
const lockPath = join(renderer, "package-lock.json");
const output = resolve(import.meta.dirname, "THIRD-PARTY-LICENSES.txt");

if (!existsSync(lockPath)) throw new Error(`Missing lockfile: ${lockPath}`);
if (!existsSync(nodeModules)) throw new Error(`Install renderer dependencies first: ${nodeModules}`);

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = Object.entries(lock.packages ?? {})
  .filter(([path, metadata]) => path.startsWith("node_modules/") && metadata?.dev !== true)
  .sort(([left], [right]) => left.localeCompare(right));
if (packages.length === 0) throw new Error("No production packages found in package-lock.json");

const sections = [
  "Notepad Viewer Plus — production runtime third-party licenses",
  "Generated from the pinned renderer package-lock.json. Do not edit individual license text by hand.",
  ""
];

for (const [packagePath, metadata] of packages) {
  const packageDirectory = join(renderer, packagePath);
  const packageJsonPath = join(packageDirectory, "package.json");
  if (!existsSync(packageJsonPath)) throw new Error(`Missing package metadata: ${packageJsonPath}`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const declaredLicense = typeof packageJson.license === "string"
    ? packageJson.license
    : JSON.stringify(packageJson.licenses ?? metadata.license ?? "UNDECLARED");
  const licenseFiles = readdirSync(packageDirectory)
    .filter((name) => /^(?:license|copying|notice)(?:[. _-].*)?$/iu.test(name))
    .sort((left, right) => left.localeCompare(right));
  if (licenseFiles.length === 0) {
    throw new Error(`No license file found for ${packageJson.name}@${packageJson.version}`);
  }

  sections.push(`\n===== ${packageJson.name} ${packageJson.version} (${declaredLicense}) =====\n`);
  for (const file of licenseFiles) {
    sections.push(`--- ${file} ---\n${readFileSync(join(packageDirectory, file), "utf8").trim()}\n`);
  }
}

writeFileSync(output, `${sections.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${packages.length} production packages)`);
