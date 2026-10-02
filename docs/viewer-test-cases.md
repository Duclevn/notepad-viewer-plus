# Viewer fixture matrix

This corpus gives the renderer repeatable, offline inputs for every text viewer
format plus each encodable image resource type and valid/invalid PDF resources. The files live under
`test-fixtures/viewer-matrix/`; the test reads them from disk instead of
embedding a second copy of each input in TypeScript.

Run the automated matrix from `renderer/` with:

```powershell
npm.cmd test -- --run viewer-matrix.test.ts
npm.cmd run lint
```

The matrix checks adapter dispatch, normal rendering, Unicode preservation,
malformed input fallbacks, active-content sanitization, OpenAPI reference
policy, and structured/tabular limits. It does not pretend that jsdom is a
WebView2 browser: the diagram frames, Chromium PDF viewer, image decoding, CSP,
and native exact-file policy still require the manual checks below.

## Corpus

| Format | Normal or Unicode input | Hostile, malformed, or bounded input | Primary expected result |
| --- | --- | --- | --- |
| Markdown | `markdown/normal.md`, `markdown/unicode.md`, `markdown/math-regression.md` | `markdown/security.md`, `markdown/malformed-front-matter.md`, `markdown/empty.md` | Headings, front matter, tables, tasks, Unicode, and the math geometry cases render; unsafe HTML and remote images are removed; malformed metadata and empty input leave the viewer usable. |
| HTML | `html/normal.html`, `html/unicode.html` | `html/security.html`, `html/empty.html` | Sanitized content is placed in a light, sandboxed `srcdoc`; scripts, forms, frames, styles, and remote images do not enter it. |
| SVG | `svg/normal.svg` | `svg/security.svg`, `svg/malformed.svg`, `svg/empty.svg` | Safe geometry survives; executable, external, and recursive content is removed; dimensions are bounded; malformed or empty input returns a safe error. |
| JSON | `json/normal.json`, `json/primitive.json` | `json/malformed.json`, `json/limit.json`, `json/empty.json` | Tree/code views preserve literal markup and primitive roots as data; parse failures, empty input, and byte-limit violations use the raw fallback. |
| YAML | `yaml/normal.yaml`, `yaml/primitive.yaml`, `yaml/aliases.yaml` | `yaml/malformed.yaml`, `yaml/security.yaml`, `yaml/deep.yaml`, `yaml/empty.yaml` | FAILSAFE YAML values, aliases, and primitive roots render as data; malformed, empty, or over-deep input falls back without executing tags or links. |
| XML | `xml/normal.xml` | `xml/malformed.xml`, `xml/security.xml` | Elements, attributes, CDATA, and Unicode render; malformed XML and DTD/entity declarations use the raw fallback. |
| CSV | `csv/normal.csv` | `csv/malformed.csv`, `csv/limit.csv`, `csv/unicode-limit.csv`, `csv/empty.csv` | Quoted newlines and commas parse; malformed quotes do not throw; row, column, ASCII-cell, UTF-8-cell, and empty-input cases stay bounded. |
| TSV | `tsv/normal.tsv` | `tsv/malformed.tsv` | Tabs are selected explicitly and malformed rows remain bounded and non-fatal. |
| Mermaid | `mermaid/normal.mmd` | `mermaid/security.mmd`, `mermaid/malformed.mmd` | The registry selects the Mermaid adapter. Installed WebView2 checks must render valid syntax, report invalid syntax, and make no network request for hostile input. |
| PlantUML | `plantuml/normal.puml` | `plantuml/security.puml`, `plantuml/malformed.puml` | The registry selects the PlantUML adapter. Installed checks must render valid syntax, report invalid syntax, and refuse `!includeurl`. |
| OpenAPI | `openapi/normal.json` | `openapi/remote-ref.json`, `openapi/malformed.json` | The valid document is local documentation with Try it out disabled; a remote `$ref` is rejected before Swagger UI; malformed JSON uses the raw fallback. |
| Plain text | `plain-text/normal.txt` | `plain-text/security.txt`, `plain-text/empty.txt` | Literal markup, paths, URLs, line breaks, Unicode, and empty input stay text. |
| Image | `image/chart.png`, `image/chart.jpg`, `image/chart.gif`, `image/chart.bmp`, `image/chart.webp`, `image/chart.ico`, `image/transparent.png` | `image/corrupt.png`; AVIF is unavailable because the installed Pillow build has no AVIF encoder | Each generated encoding is a distinct valid resource with the correct media type; transparency is retained in the PNG; corrupt content reaches the browser error path. |
| PDF | `pdf/minimal.pdf`, `pdf/multipage.pdf` | `pdf/corrupt.pdf` | Valid one-page and two-page documents reach Chromium's built-in viewer; corrupt content reaches the browser's PDF error path. |

## Automated cases

`renderer/tests/viewer-matrix.test.ts` contains these repeatable cases:

1. Dispatches all 12 text-format paths, including JSON/YAML/XML sharing the
   structured adapter and OpenAPI selected through the explicit `openapi`
   override used by the native settings path.
2. Renders the normal Markdown, HTML, SVG, JSON, YAML, XML, CSV, TSV, and plain
   text fixtures through their real adapters and checks representative DOM
   output.
3. Runs hostile Markdown and HTML through their actual sanitization and frame
   construction paths and verifies that active tags, JavaScript URLs, and
   remote images do not survive.
4. Sanitizes hostile and malformed standalone SVG files and checks the
   dimension bound.
5. Exercises raw fallbacks for malformed JSON/YAML/XML, XML DTD/entity input,
   and malformed OpenAPI JSON.
6. Parses malformed CSV/TSV without throwing and verifies CSV row, column, ASCII
   cell, and UTF-8 cell limits through both the parser and viewer warning.
7. Rejects the OpenAPI remote `$ref`, accepts the local-only valid document,
   and strips links/HTML from untrusted description strings.
8. Handles empty plain-text, CSV, and JSON files through their real adapters,
   plus primitive JSON/YAML roots, YAML aliases, and over-deep YAML. Empty
   Markdown, HTML, YAML, and SVG fixtures remain available for manual adapter
   checks.
9. Reads PNG, JPEG, GIF, BMP, WebP, and ICO bytes from disk, verifies each
   encoding signature, checks the transparent PNG color type, and passes their
   actual sizes through the image adapter with opaque exact-file URLs. The
   declared AVIF route is checked with valid resource metadata because no AVIF
   encoder is installed.
10. Reads valid one-page, valid two-page, and corrupt PDF fixtures and passes
    their actual sizes through the PDF adapter with opaque exact-file URLs.
11. Preserves Unicode and literal markup in plain text and structured values.
12. Reads `markdown/math-regression.md` through the real Markdown pipeline and
    verifies inline/display square roots, overbrace, vector, neighboring
    fraction/integral, localized invalid math, and the following paragraph.

The UTF-8 cell-limit regression covers ASCII and emoji limits of 0, 1, 2, 3, 4,
7, and 8 bytes, exact-fit values such as `😀x`, valid ellipsis code points, and
a lone-surrogate input. Every returned cell stays within its configured UTF-8
budget, and well-formed input never produces a broken surrogate.

`renderer/tests/math-geometry.test.ts` additionally renders real KaTeX output
to check radical/stretchy SVG retention and hostile SVG removal. A frame-layout
regression covers positioned overbrace content extending above and below the
root box. Browser layout remains a separate live check: jsdom does not measure
the ink, font loading, iframe clipping, or print composition.

## Manual WebView2 / Notepad++ cases

Use a matching x64 or x86 Notepad++ installation and the built plugin. Open one
fixture at a time, toggle the preview dock, and inspect the visible result.
Record pass/fail, architecture, theme, and any console/network evidence in the
release validation report.

| Case | Steps | Expected result |
| --- | --- | --- |
| Math geometry regression | Open `markdown/math-regression.md` and inspect the inline and display formulas, then print/export the preview | Both `\sqrt{x^2 + y^2}` cases show the radical and overbar; the overbrace and vector retain their geometry; the neighboring fraction/integral remain visible; the invalid formula shows a local error and the following paragraph remains readable in both screen and print output. |
| Diagram render | Open `mermaid/normal.mmd` and `plantuml/normal.puml` | Each renders as an SVG image in the dock. Switching light/dark uses the engine's theme-aware output and does not leave a loading frame. |
| Diagram rejection | Open both `malformed` diagram fixtures and the two `security` fixtures | Invalid syntax shows an inline diagram error. The PlantUML remote include is not fetched; Mermaid labels remain untrusted content. |
| OpenAPI valid | Open `openapi/normal.json`, then inspect the operation list | Local Swagger UI or the safe fallback appears, with no validator, Try it out, authorization persistence, or request to an external origin. |
| OpenAPI remote ref | Open `openapi/remote-ref.json` | The document stays in the raw fallback with a same-document-reference warning; no remote reference is requested. |
| Binary images | Open each `image/chart.{png,jpg,gif,bmp,webp,ico}` and `image/transparent.png` | Each image loads from the exact-file route, fit/actual-size controls work, and the selectable artboard does not alter authored pixels. The transparent sample keeps transparent pixels. |
| Corrupt image | Open `image/corrupt.png` | The image adapter stays responsive and shows its decode/load error instead of treating arbitrary bytes as markup. |
| Binary PDFs | Open `pdf/minimal.pdf` and `pdf/multipage.pdf` | Chromium's built-in PDF viewer displays the one-page and two-page documents through the exact-file route. The PDF frame has no renderer message channel. |
| Corrupt PDF | Open `pdf/corrupt.pdf` | The browser's PDF viewer reports an invalid document while the dock remains responsive. |
| Sanitized HTML/SVG | Open `html/security.html`, `svg/security.svg`, and `markdown/security.md` | No script, form, external frame, remote image, or JavaScript link executes; the document remains usable and the SVG artboard preserves safe geometry. |
| Malformed data | Open the malformed JSON/YAML/XML/CSV/TSV fixtures | The dock stays responsive. Structured formats show raw fallback; delimited formats show bounded rows and any truncation warning. |

The manual cases are deliberately separate from the automated assertions:
jsdom cannot prove sandboxed iframe execution, Mermaid/PlantUML frame message
handshakes, browser PDF rendering, actual image decoding, WebView2 navigation
blocking, or native exact-file token revocation.

## Provenance and safety

All text fixtures were authored in this repository as small deterministic
examples. They contain no fetched data. Hostile URLs use the reserved
`.invalid` domain and are inert test strings. The `image/chart.*` files were
encoded from one synthetic chart with the already-installed Pillow toolchain;
they are separate PNG, JPEG, GIF, BMP, WebP, and ICO files rather than renamed
bytes. `image/transparent.png` is an RGBA sample, `image/corrupt.png` is an
intentionally invalid payload, and `image/reading-chart.png` remains the
byte-for-byte copy of the existing repository fixture. AVIF was not generated:
Pillow reports no AVIF encoder in this environment, so the automated test only
checks the declared AVIF resource route and the manual matrix records AVIF as
pending an encoder-backed fixture.

`pdf/minimal.pdf` is a small hand-authored PDF containing one text line,
`pdf/multipage.pdf` is a two-page PDF generated and reopened with `pypdf`, and
`pdf/corrupt.pdf` has a PDF header but no valid object table. No remote objects
are present. Visual PDF rendering still belongs to the installed WebView2
check because Poppler/reportlab are unavailable in this environment. Keep
these fixtures offline and small; do not replace the hostile `.invalid` URLs
with live domains.
