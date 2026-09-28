import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const configDirectory = dirname(fileURLToPath(import.meta.url));

function katexWoff2Only(): Plugin {
  return {
    name: "mpp-katex-woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("katex/dist/katex.min.css")) return undefined;
      return code.replace(/src\s*:\s*([^;]+);/gu, (_match, sources: string) => {
        const woff2 = sources
          .split(",")
          .map((source) => source.trim())
          .filter((source) => /\.woff2(?:[?#)]|$)/iu.test(source));
        return `src:${woff2.join(",")};`;
      });
    }
  };
}

function packagedMermaidTiny(): Plugin {
  const sourcePath = resolve(configDirectory, "node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js");
  return {
    name: "mpp-packaged-mermaid-tiny",
    configureServer(server) {
      server.middlewares.use("/vendor/mermaid-tiny.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.end(readFileSync(sourcePath));
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith("/assets/")) response.setHeader("Access-Control-Allow-Origin", "*");
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "vendor/mermaid-tiny.js",
        source: readFileSync(sourcePath)
      });
    }
  };
}

export default defineConfig({
  plugins: [katexWoff2Only(), packagedMermaidTiny()],
  base: "./",
  build: {
    target: "es2022",
    assetsDir: "assets",
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(configDirectory, "index.html"),
        "diagram-frame": resolve(configDirectory, "diagram-frame.html"),
        "math-frame": resolve(configDirectory, "math-frame.html")
      }
    }
  },
  preview: {
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.ts"]
  }
});
