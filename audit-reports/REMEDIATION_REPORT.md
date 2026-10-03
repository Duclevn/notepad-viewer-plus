# Notepad Viewer Plus Remediation Report

Date: 2026-10-03
Repository: `C:/Users/ducle/OneDrive/Apps/notepad-viewer-plus`
Baseline: [`REPOSITORY_AUDIT_REPORT.md`](REPOSITORY_AUDIT_REPORT.md)

This report records the performance first, security, lifecycle, and cleanup work completed after the approved repository audit. The original report identified 13 findings. Each item below maps to the implementation, focused regression coverage, and the remaining verification boundary.

## Result

The highest cost avoidable work is now bounded or suppressed:

- A hidden dock does not read Scintilla text, prepare a document update, or send a renderer update. Showing the dock takes one fresh snapshot, even when automatic refresh is disabled.
- WebView2 startup is deferred until the final dock visibility decision. A transient `WM_SHOWWINDOW` during docking registration cannot start WebView2 or trigger a snapshot.
- Math, highlighting, Markdown parsing, structured copy values, and diagram work have explicit limits or cancellation paths.
- Diagram and SVG object URLs have one ownership and release path.
- Local document links use Notepad++ `NPPM_DOOPEN`; they do not invoke Windows file associations.
- Required WebView2 controller and policy handler registrations fail closed before navigation.
- Small confirmed native and renderer redundancies were removed.

The full helper log reports 71 renderer tests, renderer version/lint/build/strict-size success, Release native builds and CTest success for x64 and x86, and valid packages for both architectures. The log is machine-local:

`C:\Users\ducle\AppData\Local\NotepadViewerPlus\test-host-performance-final-20261003-065052\build-validation-final.log`

The final package evidence recorded by the helper is:

| Package | SHA-256 | Size |
|---|---|---:|
| x64 | `868a5974ecd87502b74cf462b0d2ecd370e6da85539f4f3ff13ad0cf2af29c5a` | 3,469,351 bytes |
| x86 | `b2b8a97e4713d052b107ec20df47df03ff24ef97059d7a1ad3eb26d133fcc856` | 3,458,170 bytes |

Renderer size output from the same run was 220,702 bytes raw and 80,193 bytes gzip for the initial payload, with 10,477,971 bytes of installed renderer assets.

## Finding map

### F01 — Hidden dock still performs the live preview pipeline

Status: fixed and covered by native regression tests.

`DocumentCoordinator` now gates scheduling, debounced delivery, and explicit refreshes on panel visibility. Hidden notifications do not schedule a snapshot; hiding cancels the timer, revokes resources, and advances the generation. Hidden work does not call `SCI_GETTEXT`, create a `DocumentUpdate`, or post through the bridge. The first final show calls one current refresh regardless of the automatic refresh setting. Repeated visible notifications do not refresh again.

The native fake Notepad++/Scintilla test exercises hidden edits, hidden manual refresh, one refresh on show, duplicate show suppression, latest text after a hidden edit, auto-refresh disabled on show, and resource revocation on hide. The relevant files are `native/plugin/DocumentCoordinator.{h,cpp}`, `native/preview/PreviewPanel.{h,cpp}`, `native/plugin/PluginEntry.cpp`, and `tests/native/NotepadMessageTests.cpp`.

Remaining evidence boundary: the focused test proves message and snapshot behavior; installed editor CPU and p95 latency measurements remain live validation work.

### F02 — Formula count drives iframe count without a budget

Status: fixed and covered by renderer tests.

Math placeholder registration is capped at 200 expressions per preview. Additional expressions stay as source text and produce a visible warning. Math frame readiness, cancellation, timeout, error, and response channels now use settled cleanup paths. A stale generation cannot replace a newer result.

`renderer/tests/performance-limits.test.ts` checks the expression cap and readable overflow. `renderer/tests/renderer-lifecycle.test.ts` checks cancellation and timeout cleanup. The implementation is in `renderer/src/performance/limits.ts`, `renderer/src/markdown/math.ts`, `renderer/src/markdown/math-frame.ts`, and `renderer/src/markdown/pipeline.ts`.

The source driven benchmark produced 1,000 expressions, 200 retained placeholders, and 800 literal overflow expressions. This is a Node/jsdom probe and does not measure WebView2 frame latency or memory.

### F03 — Recognized code fences have no highlighting budget

Status: fixed and covered by renderer tests.

Highlighting now allows at most 128 KiB per code block and 512 KiB across one preview. Oversized blocks remain escaped readable source with a visible status; synchronous Highlight.js work is skipped for those blocks. `renderer/tests/performance-limits.test.ts` covers both the per block and total budgets.

The benchmark recorded highlighting for 102,400 bytes and plain fallback for 1,048,576 and 5,242,880 byte inputs. The timings are informational Node/jsdom timings only, not Notepad++ or WebView2 latency.

### F04 — Diagram Blob URLs survive viewer transitions

Status: fixed and covered by renderer lifecycle tests.

Object URL ownership is centralized in `renderer/src/object-urls.ts`. Diagram, SVG, root replacement, viewer switching, timeout, and disposal paths release each owned URL at most once. The diagram renderer retains a healthy isolated realm across changed sources while replacing a stuck realm after timeout.

`renderer/tests/renderer-lifecycle.test.ts` checks exactly once release across root replacement and disposal, SVG to text viewer transitions, changed diagram generations, and timeout recovery. The implementation touches `renderer/src/diagrams/diagrams.ts`, `renderer/src/diagrams/frame.ts`, `renderer/src/viewers/svg-viewer.ts`, `renderer/src/viewers/markdown-viewer.ts`, `renderer/src/viewers/diagram-viewer.ts`, and `renderer/src/ui/app.ts`.

Long session private bytes and browser garbage collection were not measured.

### F05 — Structured copy buttons eagerly serialize nested subtrees

Status: fixed and covered by renderer tests.

Copy controls now retain deferred value callbacks outside DOM attributes. Structured JSON/YAML/XML values are serialized when the user requests a copy. The formatted Code pane is built only when selected. Ordinary tree construction does not call `JSON.stringify` for every subtree.

`renderer/tests/performance-limits.test.ts` spies on `JSON.stringify`, checks empty copy attributes, and verifies deferred Code pane construction. The source driven benchmark recorded zero retained copy attribute characters for a 263,019 byte nested input and 24 delegated copy bytes for the sample action. This character count is a logical probe result, not a physical heap measurement.

### F06 — Native text preparation makes avoidable full buffer copies

Status: fixed and covered by native protocol/message tests.

`DocumentCoordinator::ReadUtf8` reads Scintilla text into a sized `std::string` and returns it directly for UTF-8 input, removing the vector to string copy. `JsonWriter` appends escaped strings directly into the destination JSON buffer rather than creating a complete escaped temporary for every field. UTF-16 conversion at the WebView2 API boundary remains required.

Existing protocol escaping and native message tests pass, including quotes, slashes, newlines, and bounded update serialization. The changed files are `native/plugin/DocumentCoordinator.cpp` and `native/bridge/JsonWriter.cpp`.

Allocation counts and UI thread preparation timings for 1, 3, and 5 MiB documents were not instrumented.

### F07 — WebView2 initializes before the preview is used

Status: fixed; final x64 package cold startup and saved dock restoration are live confirmed.

`PreviewPanel::Create` now registers the child window without starting WebView2. A registration gate records transient child visibility while Notepad++ performs `NPPM_DMMREGASDCKDLG`; the final `NPPM_DMMSHOW` or `NPPM_DMMHIDE` decision is synchronized before WebView2 startup or coordinator notification. The final state uses the child window's own `WS_VISIBLE` style, so a hidden ancestor during restoration cannot erase a locally visible dock state. Dock persistence uses the zero based `funcItem` index (`0`) in `DockedWidgetData::dlgID`, rather than the runtime menu command ID.

The native Win32 regression covers a locally visible child under a hidden parent. The command regression covers the zero based docking index. The isolated cold startup test confirmed no WebView2 child process before the first preview toggle on the gate build. The implementation is in `native/preview/PreviewPanel.{h,cpp}`, `native/plugin/PluginEntry.cpp`, and `native/plugin/PluginConstants.h`.

The final package passed natural restarts with the dock saved open and closed. Closed startup produced zero direct child processes and zero WebView2 child processes. The live validation section below records the host and runtime versions. x86 live behavior remains untested.

### F08 — Changed diagrams recreate engine realms

Status: addressed with bounded lifecycle reuse and renderer regression coverage; installed impact remains unmeasured.

Diagram updates now retain one healthy isolated engine realm across changed sources, serialize render work, reject stale generations, and replace the realm after timeout. `renderer/tests/renderer-lifecycle.test.ts` checks reuse and stale result rejection. The source files are `renderer/src/diagrams/diagrams.ts` and `renderer/src/diagrams/frame.ts`.

No ten update versus ten cache hit WebView2 timing trace was collected.

### F09 — Relative links can execute nearby local files through Windows

Status: fixed and covered by native mock dispatch tests.

The native local link handler now resolves a contained target, requires an existing regular absolute file, and sends it through `NPPM_DOOPEN`. It no longer calls `ShellExecuteW` for renderer supplied local paths. Scripts, executable files, and shortcuts therefore open as Notepad++ documents for inspection; directories, missing files, empty paths, and non regular targets are rejected. HTTP and HTTPS external links retain their separate validated browser handler.

`tests/native/LocalDocumentOpenerTests.cpp` uses a document open dispatcher mock for `.md`, `.cmd`, `.exe`, and `.lnk` regular files and verifies that directories, missing files, and empty paths never reach it. The implementation is in `native/plugin/LocalDocumentOpener.{h,cpp}` and `native/plugin/PluginEntry.cpp`; the user facing policy is recorded in `docs/security-model.md`.

No malicious payload was launched, and no shell execution was used for this regression.

### F10 — Required WebView2 policy registrations ignore failure

Status: fixed with fail closed setup; failure injection was not run.

Controller creation, controller visibility and bounds setup, virtual host mapping, resource filtering, navigation handlers, frame navigation, resource requests, renderer messages, and initial application navigation now check `HRESULT`. A failure enters the actionable `Failed` state before application navigation is attempted. `MessageBroker::Attach` reports message handler registration failure to the panel.

The implementation is in `native/preview/PreviewPanel.cpp` and `native/bridge/MessageBroker.{h,cpp}`. Native Release builds and CTest pass. A COM mock that injects each individual WebView2 registration failure was not added; live runtime failure injection remains unverified.

### F11 — Math timeout cleanup is incomplete

Status: fixed and covered by renderer lifecycle tests.

Math readiness listeners, timeout timers, cancellation paths, and response ports now share settled cleanup. `renderer/tests/renderer-lifecycle.test.ts` asserts balanced message listener registration and removal on timeout and generation cancellation. `renderer/src/markdown/math.ts` and `renderer/src/markdown/math-frame.ts` contain the cleanup changes.

### F12 — Synchronous Markdown preparation has no complexity budget

Status: fixed with bounded fallback and renderer tests.

Markdown preflight now limits UTF-8 source to 1 MiB, lines to 20,000, and structural markers to 160,000 before parsing. Generated HTML is limited to 20,000 tags before DOM sanitization. Oversized or complex input is shown as complete plain source through `textContent`, with a visible reason. Task yields and generation checks separate the preparation stages. `renderer/tests/performance-limits.test.ts` covers source, line, rendered tag, and stale task boundaries.

The benchmark recorded a 5,580,018 byte large input with zero rendered output because the preflight fallback ran first. This is a source driven Node/jsdom result, not a WebView2 responsiveness measurement.

### F13 — Small unused declarations and redundant state

Status: fixed and validated by repository references, native build, and renderer checks.

Removed native default limit constants, unused host and debounce constants, `ResolveDocumentUri`, the unused `PreviewUpdate` alias, and `activeToken_` state. The duplicate diagram object URL assignment was removed while centralizing ownership. The cleanup is in the native bridge, plugin, resource policy, and diagram modules listed above.

No externally documented compatibility alias was removed. The full x64/x86 native builds, combined CTest executable, renderer tests, TypeScript check, and production build pass after cleanup.

## Performance priority and evidence

The remediation order follows the Notepad++ philosophy of avoiding work before tuning active work:

1. Hidden editor work and unused browser startup are suppressed at the native lifecycle boundary.
2. Worst case renderer work is bounded before parsing, highlighting, math frame creation, and structured serialization.
3. Resource ownership and cancellation prevent repeated viewer changes from accumulating work or Blob data.
4. Native hot path copies and small redundant state were reduced after preserving protocol and message contracts.

The benchmark JSON is:

`C:\Users\ducle\AppData\Local\NotepadViewerPlus\test-host-performance-20261003-062747\renderer-benchmark.json`

It was produced from production TypeScript in Node.js and jsdom. Its durations are informational only and are explicitly not WebView2 or Notepad++ latency measurements. Installed process memory, idle CPU, editor callback latency, and preview p95 latency still require an installed profiling run.

## Validation record

The supplied final helper log records:

- Renderer version synchronization, TypeScript lint, 71 Vitest tests, production build, and strict size gate: passed.
- x64 Release CMake build and combined native CTest 1/1: passed.
- x86 Release CMake build and combined native CTest 1/1: passed.
- x64 and x86 CPack ZIP creation and plugin package validation: valid.
- x64 package: 3,469,351 bytes, SHA-256 `868a5974ecd87502b74cf462b0d2ecd370e6da85539f4f3ff13ad0cf2af29c5a`.
- x86 package: 3,458,170 bytes, SHA-256 `b2b8a97e4713d052b107ec20df47df03ff24ef97059d7a1ad3eb26d133fcc856`.

The native focused test target also passed after the final dock restoration and visibility gate changes. `git diff --check` was run on the shared worktree.

## Live validation

The final x64 ZIP was extracted into a separate portable test host under `%LOCALAPPDATA%`. It used a byte-for-byte copy of Notepad++ 8.9.8.1 and WebView2 154.0.4258.48, with its own configuration, fixtures, plugin directory, and WebView2 user-data directory. The existing user Notepad++ process and installation were preserved. The staged final DLL SHA-256 was `e88eac76ba557fd9e69f69841f7d4e3586ee2446ab8c8eff0134569482040d1f`.

| Live check | Result |
|---|---|
| Math geometry fixture | Inline/display radicals, overbar, overbrace, vector, fraction, and integral were visible after a settled wide-dock refresh. Invalid math remained a local error and the following paragraph stayed readable. |
| Mermaid | Initial diagram rendered. An unsaved source edit added the correct fourth node. Undo while hidden followed by reopening displayed the current three-node diagram. |
| PlantUML | Offline sequence diagram rendered after transitions through other formats. |
| JSON | Tree and on-demand Code view displayed Unicode and literal script markup as text. Copy through the UI pasted the correct formatted JSON into an isolated unsaved editor buffer, then the buffer was discarded. |
| HTML, SVG, image | Readable HTML content, standalone SVG geometry, and the image/checkerboard artboard displayed after viewer transitions. The HTML fixture's missing image remained its placeholder. |
| PDF | Built-in isolated viewer loaded the exact-file minimal PDF and displayed its text. Transition to image succeeded. |
| OpenAPI | Local Swagger UI displayed the offline catalog and GET operation. |
| Oversized Markdown | A 1,300,028-byte fixture displayed the 1 MiB warning and readable source fallback. Switching back to ordinary Markdown succeeded. |
| Local script link | Clicking the relative `.cmd` link opened `local-file.cmd` in Notepad++ as plain source. Native regression tests separately cover `.exe`, `.lnk`, missing files, and directories. |
| Theme | Light and dark previews displayed readable content; the selected dark theme survived restart. |
| Saved visible dock | A natural close/restart restored the visible dock and current document using docking index `0`, without a manual toggle. |
| Saved closed dock | A natural close/restart left the dock closed. Final host PID 31036 had zero direct child processes and zero WebView2 child processes before use. The isolated host was then closed. |

These are representative visual and interaction checks, not an exhaustive release matrix or latency profile. They do not establish x86 live behavior, every format fixture, external-link browser behavior, every theme/DPI combination, PDF export/printing, network capture, or long-running memory stability. Automated tests cover generation cancellation, hung diagram recovery, math cleanup, resource revocation, parser budgets, and native link dispatch separately.

## Not performed

No user installed plugin was replaced. No commit or push was made. No public release was published. Broad install, upgrade, rollback, migration, DPI, and clean machine matrices remain release validation. No current dependency advisory scan or exhaustive WebView2 network capture was performed. No native WebView2 COM failure injection or installed performance trace was run.
