import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../renderer/dist");
const port = Number(process.argv[2] ?? 4175);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

createServer((request, response) => {
  let requested;
  try {
    requested = decodeURIComponent((request.url ?? "/").split("?", 1)[0]);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  const relative = requested === "/" ? "/index.html" : requested;
  const file = resolve(root, `.${normalize(relative)}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
