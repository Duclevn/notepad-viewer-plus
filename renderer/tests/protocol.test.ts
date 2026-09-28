import { describe, expect, it } from "vitest";
import { isDocumentUpdate, MAX_DOCUMENT_BYTES } from "../src/bridge/protocol";

describe("message protocol", () => {
  const valid = {
    type: "preview.update",
    protocolVersion: 2,
    generation: 2,
    bufferId: 10,
    formatHint: "markdown",
    file: { name: "hello.md", extension: ".md", saved: false },
    source: { kind: "text", text: "# hello" },
    theme: "dark",
    settings: {
      showFrontMatter: true,
      showTableOfContents: false,
      rawHtml: true,
      remoteImages: false,
      mathAlternateDelimiters: false,
      codeWrapping: true,
      formatOverride: "auto",
      maximumTextBytes: 5 * 1024 * 1024,
      maximumStructuredBytes: 5 * 1024 * 1024,
      maximumCsvRows: 10000,
      maximumCsvColumns: 100,
      maximumCsvCellBytes: 64 * 1024,
      maximumResourceBytes: 512 * 1024 * 1024
    }
  };

  it("accepts a bounded document update", () => {
    expect(isDocumentUpdate(valid)).toBe(true);
  });

  it("accepts exact binary resources only for matching viewer formats", () => {
    const resourceUpdate = {
      ...valid,
      formatHint: "image",
      file: { name: "photo.png", extension: ".png", saved: true },
      source: {
        kind: "resource",
        token: "opaque-token",
        url: "https://doc.local/file/opaque-token",
        size: 12,
        mediaType: "image/png"
      }
    };
    expect(isDocumentUpdate(resourceUpdate)).toBe(true);
    expect(isDocumentUpdate({ ...resourceUpdate, formatHint: "pdf" })).toBe(false);
    expect(isDocumentUpdate({ ...resourceUpdate, source: { ...resourceUpdate.source, mediaType: "application/pdf" } })).toBe(false);
  });

  it("rejects wrong protocol, unsafe shape, and oversized text", () => {
    expect(isDocumentUpdate({ ...valid, protocolVersion: 1 })).toBe(false);
    expect(isDocumentUpdate({ ...valid, type: "document.update" })).toBe(false);
    expect(isDocumentUpdate({ ...valid, generation: -1 })).toBe(false);
    expect(isDocumentUpdate({ ...valid, settings: { ...valid.settings, remoteImages: "yes" } })).toBe(false);
    const { showTableOfContents: _missing, ...incompleteSettings } = valid.settings;
    expect(isDocumentUpdate({ ...valid, settings: incompleteSettings })).toBe(false);
    expect(isDocumentUpdate({ ...valid, source: { kind: "text", text: "x".repeat(MAX_DOCUMENT_BYTES + 1) } })).toBe(false);
    expect(isDocumentUpdate({ ...valid, settings: { ...valid.settings, maximumTextBytes: 2 }, source: { kind: "text", text: "123" } })).toBe(false);
  });
});
