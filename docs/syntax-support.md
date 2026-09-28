# Syntax support

Markdown Preview Plus renders the active document locally inside WebView2. The renderer does not contact a CDN or a diagram server.

## Markdown and metadata

- Common Markdown is parsed by Markdown-it.
- YAML front matter is recognized only at the start of the document, with an optional UTF-8 BOM. It is parsed with a non-constructing YAML schema and shown as a GitHub-style metadata table, including bounded nested maps and lists.
- Raw HTML is enabled by default but passed through an allowlist sanitizer. The setting can disable raw HTML.
- Relative images are served only from the current document directory after native canonical-path validation. Remote images are disabled by default; the opt-in mode permits HTTPS images only.
- **Plugins → Markdown Preview Plus → Toggle Table of Contents** shows or hides a generated, collapsible heading list. The preference is persisted, is off by default, and lists at most the first 500 headings.

## Fences

The following diagram fences are recognized:

- `plantuml` and `puml`: rendered by the bundled MIT `@plantuml/core` runtime. Remote and arbitrary local `!include` directives are intentionally disabled.
- `mermaid`: rendered by the bundled Mermaid Tiny runtime. Mermaid Tiny does not include mindmaps, architecture diagrams, ELK layouts, or Mermaid's internal KaTeX integration.
- `math`: rendered by KaTeX.
- Supported code languages are JavaScript/TypeScript, JSON, XML/HTML, CSS/SCSS, YAML, Markdown, Bash, PowerShell, Python, Java, Kotlin, C/C++, C#, SQL, Go, Rust, PHP, and Dockerfile. Highlighting is opt-in by explicit fence language; unknown languages remain escaped text.

## Math

The default delimiters are `$...$` and `$$...$$`. `\(...\)` and `\[...\]` can be enabled in settings. KaTeX runs with `trust: false`, bounded expansion, and local WOFF2 fonts.

## Admonitions

These forms are normalized to one safe component:

```markdown
> [!NOTE]
> A GitHub alert.

::: warning "A title"
Container content.
:::

!!! tip "A title"
    MkDocs content.
```

Supported styles are `note`, `tip`, `info`, `important`, `success`, `warning`, `caution`, and `danger`. Unknown styles use note styling.

## Preview controls

- Use **Ctrl+Alt+P** to toggle the docked preview. The shortcut can be changed through Notepad++'s Shortcut Mapper.
- The panel starts hidden on a new installation. If it was left open, Notepad++ may restore it on the next launch; restored panels immediately render the active document.

## Known first-release limitations

- Preview export, editing in the preview, and source/preview scroll synchronization are not included.
- PlantUML server mode, remote includes, arbitrary local includes, and optional standard-library packs are not included.
- Mermaid support is limited to the diagrams shipped by Mermaid Tiny.
- The native shell requires the WebView2 Evergreen Runtime and a matching x64 or Win32 plugin package.
