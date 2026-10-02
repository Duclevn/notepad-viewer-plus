# Multi-format validation results

Run date: 2026-10-02. This report separates automated checks from observed installed behavior and records the remaining release-validation limits.

## Baseline

- Clean source baseline: `dfee894` (0.3.0).
- Executed `& .\Build-Development.ps1 -Architecture x64,x86 -Package`: renderer version, TypeScript, 36 tests, production build and strict size gate passed; fresh native builds and CTest passed for both architectures; both ZIP validators reported `valid=true`.
- Machine-local transcript: `%LOCALAPPDATA%\NotepadViewerPlus\test-evidence\build-development-x64-x86-package.transcript.txt`.
- Installed DLL SHA-256: `6CDE3EC3A0DE48812506C188C5BFB20C3C9AD75C6781E6C481E2A060592772FF`, file version `0.3.0.0`. All 59 installed renderer assets matched the freshly built baseline `renderer/dist` by SHA-256.
- Native CTest is one combined executable containing several regression groups; `1/1` does not mean one assertion or exhaustive runtime coverage.
- Vite's externalized `url` and large-chunk advisories did not fail the baseline gates.

## Installed Notepad++ / WebView2 observations

Windows computer-use skill, actual installed x64 Notepad++ window, screenshot inspection after refresh. Existing user documents were preserved.

| Case | Input/action | Result and evidence |
|---|---|---|
| Markdown basics | `tests/syntax-showcase.md`, Toggle Preview | PASS: front matter, headings, Vietnamese/Japanese/Arabic/Greek text, lists, tasks and table visible. |
| Local/remote image | Showcase section 3 | PASS visually: local chart rendered; remote image displayed `remote image blocked`. This alone does not prove absence of network traffic. |
| Generated math | Showcase section 4 | FAIL baseline: `\sqrt{x^2 + y^2}` missing radical and overbar; adjacent Pythagorean expression and integral/fraction visible. Malformed math produced a local error with following paragraph still visible. |
| PNG exact-file viewer | Open `tests/reading-chart.png` | PASS: decoded chart with Fit controls and checkerboard background, after debounce. |
| Image controls | Dark background, Actual size | PASS: dark artboard without changing chart colors; scale changed from Fit to 100%. |
| Image zoom | Click `+` after Actual size | PASS: scale became 125%; chart enlarged and viewport scrollbars appeared. |
| JSON tree/code | `json/normal.json`, Code button | PASS: six properties, nested item badges, Unicode and literal script text; code view switched and highlighted source. |
| Live refresh | Temporarily replace JSON editor text with `{"name":"Live refresh Việt Nam","newValue":42}` | PASS: unsaved text replaced preview with two properties after debounce. Undo restored original editor content and cleared modified marker; no save performed. |
| YAML | `yaml/normal.yaml` | PASS: YAML-labelled five-property tree, Unicode and literal markup visible; FAILSAFE scalar interpretation retained. |
| XML | `xml/normal.xml` | PASS: XML-labelled tree containing catalog, attributes and two-item array. |
| PDF | `pdf/minimal.pdf` | PASS: built-in PDF toolbar reported 1 of 1; page displayed `Offline PDF fixture`. |
| Plain text | `plain-text/normal.txt` | PASS: line breaks, Japanese, Arabic, combining accent and emoji visible as plain text. |
| OpenAPI | `openapi/normal.json`, expand GET `/items` | PASS visually: local Swagger UI title/version/operation and 200 response appeared; no Try it out button. No network-capture claim. |
| PlantUML | `plantuml/normal.puml` | PASS: Alice/Bob sequence, Offline hello and Ack arrows rendered. |
| Mermaid | `mermaid/normal.mmd` | PASS: Source, Parser and Offline preview nodes and directional arrows rendered. |
| SVG | `svg/normal.svg` | PASS: authored blue line and red point rendered on light artboard with background controls. |
| HTML | `html/normal.html` | PASS: heading, paragraph and table rendered in light frame. Local placeholder image is intentionally absent from fixture data and displayed its alt text. |
| TSV | `tsv/normal.tsv` | PASS: TAB delimiter, uneven four-column rows preserved with added Column 4 heading. |
| CSV | `csv/normal.csv` | PASS: three-column grid, quoted newline retained within Ada's cell, quoted comma retained within Japanese row. |
| PlantUML offline rejection | `plantuml/security.puml` | PASS: remote include rejected with offline-policy diagnostic. |
| OpenAPI remote reference | `openapi/remote-ref.json` | PASS: raw fallback with same-document-reference warning. |
| Malformed CSV | `csv/malformed.csv` | PASS: readable two-column table; unterminated quoted input remained a cell without hanging. |
| XML entities | `xml/security.xml` | PASS: DTD/entity declarations disabled warning and raw source. |
| Malformed YAML | `yaml/malformed.yaml` | PASS: parse diagnostic and raw source. |
| Malformed JSON | `json/malformed.json` | PASS: parse diagnostic and raw source. |
| Malformed PlantUML | `plantuml/malformed.puml` | Bounded failure: missing end marker reached the 25-second renderer timeout and displayed Diagram error; preview remained usable. |
| Malformed Mermaid | `mermaid/malformed.mmd` | PASS: localized parse error. |
| Hostile Markdown | `markdown/security.md` | PASS visually: heading, inert link label, blocked remote image and literal fenced source; no alert appeared. Automated sanitizer assertions provide separate evidence. |
| Hostile SVG | `svg/security.svg` | PASS visually: bounded empty artboard, no alert or external content visible. |
| Hostile HTML | `html/security.html` | PASS visually: inert link label, blocked-image alt text and preserved input child; no alert or external frame visible. Removed form wrapper does not imply all child controls disappear. |

## Corrected x64 package observations

The isolated host `test-host-final-20261002-210834/NvpViewerTest.exe` used the rebuilt x64 ZIP. All 61 staged payload files matched the ZIP by bytes and SHA-256. The renamed host executable was byte-identical to installed Notepad++; local configuration markers isolated its session. The `asNotepad.xml` multi-instance marker follows the [official Notepad++ configuration manual](https://github.com/notepad-plus-plus/npp-usermanual/blob/master/content/docs/config-files.md). The installed user's plugin was not replaced.

| Case | Input/action | Result |
|---|---|---|
| First launch | Fresh local configuration | PASS: preview initially hidden. |
| Corrected math, light | `markdown/math-regression.md` | PASS radicals/bars, vector and neighboring fraction/integral; invalid command stayed local and following paragraph readable. Later full-page PDF inspection exposed clipping below the overbrace; that expression is not a pass. |
| Corrected math, dark | Theme: Dark; wait for render completion | PASS radicals/bars and readable dark foreground; stacked overbrace clipping also applies. |
| Corrupt PDF | `pdf/corrupt.pdf` | PASS: built-in viewer displayed We can't open this file; switching documents remained responsive. |
| Multi-page PDF | `pdf/multipage.pdf` | PASS: toolbar 1 of 2; both pages displayed their distinct Offline PDF page one/two text. |
| Corrupt PNG | `image/corrupt.png` | PASS: Image could not be loaded diagnostic with responsive image controls. |
| Transparency | `image/transparent.png` | PASS: grid visible through outer transparent region and center cutout. |
| ICO | `image/chart.ico` | PASS: small chart decoded. |
| WebP | `image/chart.webp` | PASS: chart decoded. |
| BMP | `image/chart.bmp` | PASS: chart decoded. |
| GIF | `image/chart.gif` | PASS: chart decoded (single-frame fixture; animation not tested). |
| JPEG | `image/chart.jpg` | PASS: chart decoded. |
| PNG | `image/chart.png` | PASS: chart decoded. |

## Dark-theme printing and document replacement

The later isolated `test-host-final-print-20261002-211904/NvpPrintTest.exe` used the reviewed print correction. Its 61 payload files matched the validated x64 ZIP. Print-only styles select the existing light foreground/palette for self-owned renderer UI and math; live dark rendering and authored image/SVG colors are preserved.

| Case | Input/action | Result |
|---|---|---|
| Dark-theme print, baseline | Print the math fixture before print correction | FAIL: pale dark-theme foreground and radical geometry disappear on white paper. |
| Dark-theme print, corrected palette | WebView2 Print to PDF, inspect preview and PDFium-rendered exported page | PASS for print contrast, square-root bars, vector, fraction/integral and the following paragraph. Full-page inspection exposed the separately tracked overbrace clipping. |
| Hidden-panel document replacement | Hide dock on math, select `json/primitive.json`, reopen dock | PASS: current numeric root `42` appeared; the previous math content did not remain. |
| YAML aliases | `yaml/aliases.yaml` | PASS: defaults/copy alias data appeared in the tree; literal `<script> stays text` remained data. FAILSAFE parsing retains the `<<` key rather than applying YAML merge semantics. |
| Empty JSON | Switch from aliases to `json/empty.json` | PASS: `Unexpected end of JSON input` and empty raw fallback replaced the old tree after debounce. |
| Dark PlantUML | `plantuml/normal.puml` | PASS: readable Alice/Bob boxes, labels and arrows on the dark preview. |
| Dark Mermaid | `mermaid/normal.mmd` | PASS for dark nodes, labels and arrows; a WebView2 Downloads overlay partly covered the rightmost node during this capture. The full diagram was separately visible in the baseline light check. |

The first corrected-palette export is `%LOCALAPPDATA%\NotepadViewerPlus\test-evidence\math-regression-final-dark-print-20261002.pdf`, SHA-256 `9D73EF2020AD0D0F379790B530B275E1F8BB17BDA63B677FE8724BC36F87197A`. It documents the remaining overbrace defect and is not a complete math acceptance pass.

## Automated matrix and current gates

The corpus contains 60 fixture files covering 14 viewer paths. The final renderer suite has 55 passing tests across eight files (36 baseline plus 15 matrix and four math geometry/security/layout cases). The complete OneDrive-safe helper passed renderer version, TypeScript, tests, production build and strict size checks, fresh x64/x86 native builds and CTest, and both package validators after all corrections. The current root versioned installer wrapper exists and passes version synchronization. No diagnostic probe asset is present in the production output.

Final package evidence, under `%LOCALAPPDATA%\NotepadViewerPlus\development\d902d296cb0e\<architecture>\packages\`:

| Architecture | ZIP | Bytes | SHA-256 | Validator |
|---|---|---:|---|---|
| x64 | `NotepadViewerPlus-0.3.0-x64.zip` | 3,466,538 | `4306AD1A1E1E52B61B23239759232E948E5715A18F99E30E88587B0C5DE4C912` | `valid=true` |
| x86 | `NotepadViewerPlus-0.3.0-x86.zip` | 3,455,477 | `99B25D8E19439685CFAA77AA42028CDD996809A016FB918DAC9462B6C014660` | `valid=true` |

The full run and staging evidence are in `%LOCALAPPDATA%\NotepadViewerPlus\test-evidence\build-development-bounds-summary.txt`, `build-development-bounds-x64-x86-package.transcript.txt`, and `test-host-final-bounds-20261002-214549-audit.json`. The final x64 host is `test-host-final-bounds-20261002-214549/NvpBoundsTest.exe`; all 61 ZIP payload entries match its staged files, with no missing or extra files. The installed user's plugin remains the original build.

The matrix discovered that a Japanese CSV cell with an eight-byte limit produced 12 UTF-8 bytes. The correction truncates whole Unicode code points and counts any ellipsis within the budget. Regression cases cover zero/small limits, ASCII, emoji, exact fits and a lone surrogate. The reviewed math sanitizer correction retains KaTeX's inert `svg`/`path` geometry while preserving the existing active-content, URL, style, CSP and sandbox boundaries.

## Final math acceptance

Root-only KaTeX measurement omitted positioned overbrace content: browser evidence showed a roughly 21.5-pixel root box while visible content extended from about -2.6 to 47.1 pixels. The corrected frame waits for local fonts, measures visible `.katex-html` content and SVG bounds, excludes hidden MathML, shifts negative coordinates into view and remeasures. The existing display centering, dimension clamps, source checks, sandbox and CSP are retained. Read-only review found no remaining material issue. Browser-probe evidence is retained in `%LOCALAPPDATA%\NotepadViewerPlus\test-evidence\math-bounds-probe.txt`.

| Case | Final host observation | Result |
|---|---|---|
| Light screen | Inline/display square roots, complete overbrace label/brace/`a+b+c`, vector, fraction/integral | PASS after all frames completed. |
| Dark screen | Same full fixture, Theme: Dark | PASS: complete geometry and readable foreground. |
| Dark-theme Print to PDF | WebView2 print preview, then exported PDF rendered with PDFium at 2× | PASS: all geometry and underlying overbrace expression visible on white paper; no clipping in the full-page inspection. |
| Invalid formula | `\htmlClass{unsafe}{x}` followed by normal paragraph | PASS on light/dark screen and PDF: local red command error, following paragraph readable. |

The final export is `%LOCALAPPDATA%\NotepadViewerPlus\test-evidence\math-regression-final-bounds-dark-20261002.pdf`, SHA-256 `E3AD3B9EDB797359847323EF0CA266939AE52F5A0A02DACC07A3B92FBA52F21B`. It contains one page; text extraction includes the full `a+b+c` and following paragraph. The PNG inspection artifact is the same path plus `.page1.png`. Text extraction alone cannot prove radical/brace geometry; the rendered-page inspection does.

## Remaining execution

Not run: AVIF decoding, x86 live UI, animated-image behavior, release-wide host/runtime compatibility, install/upgrade/restart, toolbar/DPI matrix, network capture, and runtime token-revocation smoke checks. Cancellation is covered by existing automated tests and observed document replacement, but no exhaustive rapid-edit stress run is claimed. These remain manual/release checks; successful unit/build/package results do not establish them. No commit, push, public release, or replacement of the installed user's plugin was performed.
