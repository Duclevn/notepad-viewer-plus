import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const argumentsList = process.argv.slice(2);
const strict = argumentsList.includes("--strict");
const input = argumentsList.find((argument) => !argument.startsWith("--")) ?? "renderer/dist";
const archive = argumentsList.find((argument) => argument.endsWith(".zip"));
const root = resolve(process.cwd(), input);
if (!existsSync(root)) {
  console.error(`Size input does not exist: ${root}`);
  process.exitCode = 1;
  process.exit();
}

function filesIn(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesIn(full));
    else result.push(full);
  }
  return result;
}

const files = filesIn(root).map((file) => {
  const data = readFileSync(file);
  return {
    name: relative(root, file).replaceAll("\\", "/"),
    bytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength
  };
});
const required = ["index.html", "diagram-frame.html", "math-frame.html", "vendor/mermaid-tiny.js"];
const names = new Set(files.map((file) => file.name));
const missing = required.filter((name) => !names.has(name));
if (missing.length > 0) {
  console.error(`Missing required renderer assets: ${missing.join(", ")}`);
  process.exitCode = 1;
  process.exit();
}

const entryHtml = readFileSync(join(root, "index.html"), "utf8");
const initialNames = new Set(["index.html"]);
for (const match of entryHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/gu)) initialNames.add(match[1]);
const initial = files.filter((file) => initialNames.has(file.name));
const lazy = files.filter((file) => !initialNames.has(file.name));
const sum = (items, property) => items.reduce((total, item) => total + item[property], 0);
const raw = sum(files, "bytes");
const initialGzip = sum(initial, "gzipBytes");
const releaseZipEstimate = sum(files, "gzipBytes") + 64 * 1024;

console.log(`Renderer output: ${root}`);
console.log(`Initial payload: ${sum(initial, "bytes")} bytes raw, ${initialGzip} bytes gzip`);
console.log(`Lazy payload: ${sum(lazy, "bytes")} bytes raw, ${sum(lazy, "gzipBytes")} bytes gzip`);
console.log(`Installed renderer assets: ${raw} bytes (${(raw / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`ZIP estimate (gzip sum + 64 KiB metadata): ${releaseZipEstimate} bytes (${(releaseZipEstimate / 1024 / 1024).toFixed(2)} MiB)`);
const swagger = files.filter((file) => /swagger-ui/iu.test(file.name));
if (swagger.length > 0) console.log(`OpenAPI Swagger UI lazy payload: ${sum(swagger, "bytes")} bytes raw, ${sum(swagger, "gzipBytes")} bytes gzip`);
const pdf = files.filter((file) => /pdf(?:\.js|[-_])/iu.test(file.name));
if (pdf.length > 0) console.log(`PDF viewer lazy payload: ${sum(pdf, "bytes")} bytes raw, ${sum(pdf, "gzipBytes")} bytes gzip`);
if (archive) {
  if (!existsSync(resolve(process.cwd(), archive))) {
    console.error(`ZIP archive does not exist: ${archive}`);
    process.exitCode = 1;
    process.exit();
  }
  const archiveBytes = statSync(resolve(process.cwd(), archive)).size;
  console.log(`Release ZIP: ${archiveBytes} bytes (${(archiveBytes / 1024 / 1024).toFixed(2)} MiB)`);
}

const warnings = [];
if (initialGzip > 250 * 1024) warnings.push("initial payload exceeds the Phase 2 250 KiB hard budget");
if (raw > 20 * 1024 * 1024) warnings.push("installed renderer assets exceed the 20 MiB warning threshold");
if (releaseZipEstimate > 8 * 1024 * 1024) warnings.push("estimated release archive exceeds the 8 MiB warning threshold");
if (archive && statSync(resolve(process.cwd(), archive)).size > 8 * 1024 * 1024) warnings.push("release ZIP exceeds the 8 MiB warning threshold");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (strict && warnings.length > 0) process.exitCode = 1;

const largest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
console.log("Largest assets:");
for (const file of largest) console.log(`  ${file.name}: ${file.bytes} bytes raw, ${file.gzipBytes} bytes gzip`);
