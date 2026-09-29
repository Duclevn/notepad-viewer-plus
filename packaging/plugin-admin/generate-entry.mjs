import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const values = new Map();
for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith("--") || !argument.includes("=")) continue;
  const [key, ...parts] = argument.slice(2).split("=");
  values.set(key, parts.join("="));
}

const required = ["zip", "arch", "version", "repository", "author", "homepage"];
const missing = required.filter((key) => !values.get(key));
if (missing.length > 0) {
  console.error(`Missing options: ${missing.map((key) => `--${key}=...`).join(", ")}`);
  console.error("Example: node generate-entry.mjs --zip=release/NotepadViewerPlus-0.2.2-x64.zip --arch=x64 --version=0.2.2 --repository=https://github.com/example/releases/download/v0.2.2/NotepadViewerPlus-0.2.2-x64.zip");
  process.exit(2);
}

const zipPath = resolve(process.cwd(), values.get("zip"));
const architecture = values.get("arch");
if (!existsSync(zipPath)) throw new Error(`ZIP does not exist: ${zipPath}`);
if (!["x86", "x64", "arm64"].includes(architecture)) throw new Error("--arch must be x86, x64, or arm64");
if (!/^https:\/\//iu.test(values.get("repository"))) throw new Error("--repository must be a direct HTTPS ZIP URL");

const id = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
const entry = {
  "folder-name": "NotepadViewerPlus",
  "display-name": "Notepad Viewer Plus",
  version: values.get("version"),
  id,
  repository: values.get("repository"),
  description: values.get("description") ?? "Offline multi-format preview for Notepad++ with Markdown, diagrams, structured data, tabular data, images, and safe document viewers.",
  author: values.get("author"),
  homepage: values.get("homepage")
};
if (values.has("npp-compatible-versions")) entry["npp-compatible-versions"] = values.get("npp-compatible-versions");
console.log(JSON.stringify(entry, null, 2));
console.error(`SHA-256 (${architecture}): ${id}`);
