import { describe, expect, it } from "vitest";
import { isDocumentUpdate, MAX_DOCUMENT_BYTES } from "../src/bridge/protocol";

describe("message protocol", () => {
  const valid = {
    type: "document.update",
    protocolVersion: 1,
    generation: 2,
    bufferId: 10,
    text: "# hello",
    theme: "dark",
    settings: {
      showFrontMatter: true,
      showTableOfContents: false,
      rawHtml: true,
      remoteImages: false,
      mathAlternateDelimiters: false,
      codeWrapping: true
    }
  };

  it("accepts a bounded document update", () => {
    expect(isDocumentUpdate(valid)).toBe(true);
  });

  it("rejects wrong protocol, unsafe shape, and oversized text", () => {
    expect(isDocumentUpdate({ ...valid, protocolVersion: 2 })).toBe(false);
    expect(isDocumentUpdate({ ...valid, generation: -1 })).toBe(false);
    expect(isDocumentUpdate({ ...valid, settings: { ...valid.settings, remoteImages: "yes" } })).toBe(false);
    const { showTableOfContents: _missing, ...incompleteSettings } = valid.settings;
    expect(isDocumentUpdate({ ...valid, settings: incompleteSettings })).toBe(false);
    expect(isDocumentUpdate({ ...valid, text: "x".repeat(MAX_DOCUMENT_BYTES + 1) })).toBe(false);
  });
});
