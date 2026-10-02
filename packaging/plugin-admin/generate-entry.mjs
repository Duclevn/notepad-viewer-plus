import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const values = new Map();
for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith("--") || !argument.includes("=")) continue;
  const [key, ...parts] = argument.slice(2).split("=");
  values.set(key, parts.join("="));
}

const required = ["report", "repository", "homepage"];
const missing = required.filter((key) => !values.get(key));
if (missing.length > 0) {
  console.error(`Missing options: ${missing.map((key) => `--${key}=...`).join(", ")}`);
  console.error("Run validate-package.ps1 first, then pass its fresh JSON report with --report=...");
  process.exit(2);
}

const reportPath = resolve(process.cwd(), values.get("report"));
if (!existsSync(reportPath)) throw new Error(`Validator report does not exist: ${reportPath}`);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (report.schemaVersion !== 1 || report.valid !== true) throw new Error("Validator report is not a valid schema-v1 success report");
if (!report.zipPath || !existsSync(report.zipPath)) throw new Error(`Validated ZIP does not exist: ${report.zipPath ?? "<missing>"}`);
if (!["x64", "x86"].includes(report.observedArchitecture)) throw new Error("Only validated x64 and x86 packages are supported");
if (!/^\d+\.\d+\.\d+$/u.test(report.observedVersion)) throw new Error("Validator report contains an invalid release version");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const canonicalVersion = JSON.parse(readFileSync(resolve(projectRoot, "version.json"), "utf8")).version;
if (report.observedVersion !== canonicalVersion) {
  throw new Error(`Validator report version ${report.observedVersion} does not match version.json ${canonicalVersion}`);
}

const zipBytes = readFileSync(report.zipPath);
const id = createHash("sha256").update(zipBytes).digest("hex");
if (id !== report.sha256) throw new Error("Validator report is stale: ZIP SHA-256 no longer matches");
if (zipBytes.byteLength !== report.sizeBytes) throw new Error("Validator report is stale: ZIP size no longer matches");

const repository = new URL(values.get("repository"));
if (repository.protocol !== "https:" || repository.username || repository.password || !repository.pathname.toLowerCase().endsWith(".zip")) {
  throw new Error("--repository must be a direct, unauthenticated HTTPS ZIP URL");
}
const homepage = new URL(values.get("homepage"));
if (homepage.protocol !== "https:" || homepage.username || homepage.password) throw new Error("--homepage must be an HTTPS URL");

const entry = {
  "folder-name": "NotepadViewerPlus",
  "display-name": "Notepad Viewer Plus",
  version: report.observedVersion,
  id,
  repository: repository.href,
  description: values.get("description") ?? "Offline multi-format preview for Notepad++ with Markdown, diagrams, structured data, tabular data, images, OpenAPI, and PDF viewing.",
  author: "Duc Le",
  homepage: homepage.href
};
if (values.has("npp-compatible-versions")) entry["npp-compatible-versions"] = values.get("npp-compatible-versions");
console.log(JSON.stringify(entry, null, 2));
console.error(`Validated SHA-256 (${report.observedArchitecture}): ${id}`);
