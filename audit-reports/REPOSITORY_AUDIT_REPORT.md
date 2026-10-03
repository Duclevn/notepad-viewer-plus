# Repository Audit Report

## 1. Audit Metadata

- Repository: C:/Users/ducle/OneDrive/Apps/notepad-viewer-plus
- Branch: master
- Commit: 19a51932c6f2011a4cdee635f4b9429a003ebbdc
- Audit date: 2026-10-03
- Model: primary Codex session (GPT-6 family), assisted by two read-only reviewer agents.
- Scope: whole first-party product, with performance first, then security, reliability, code clarity, redundancy, tests, dependencies, documentation and packaging.
- Baseline: clean working tree; 257 tracked paths, 181 first-party files, 955,838 first-party tracked bytes. Approximately 2,406 nonblank native source lines and 3,863 nonblank renderer source lines.
- Exclusions: normal code-quality review of vendored SDK/dependency internals, generated bundles, binary artwork and fixtures. Their integration, configuration and packaged sizes were considered.
- Tools: PowerShell, Git, rg, Node, existing Rolldown/jsdom/Highlight.js, npm, CMake/MSVC, CTest, and official WebView2 documentation.
- No application source, tests, manifests or maintained configuration were changed. Existing build commands regenerated ignored renderer output and machine-local native artifacts. No software was installed; no commit, push, package installation or public release was performed.
- Report location: audit-reports/REPOSITORY_AUDIT_REPORT.md, approved by the user.

## 2. Executive Summary

The code has a sound, reasonably small native/renderer separation and strong existing security controls. It does not need wholesale replacement to improve performance. However, the current implementation has concrete unnecessary background work, a diagram Blob URL leak, repeated subtree serialization, and insufficient work budgets for math and highlighting.

The first performance priority is to stop snapshots and renderer updates while the dock is hidden (F01). The next priorities are deterministic resource cleanup (F04/F11), lazy copy serialization (F05), and explicit math/highlighting limits (F02/F03). Browser startup and diagram engine reuse are useful subsequent profiling targets (F07/F08).

A separate high-priority security issue is unrestricted local link dispatch through ShellExecute (F09). This requires an attacker-supplied local payload and a user click; it is not automatic execution on document load. It should be fixed before treating arbitrary downloaded document bundles as safe preview inputs.

All existing checks executed in this pass passed. Passing tests and a small distribution do not establish installed editor latency or browser memory consumption.

## 3. Product Understanding

Notepad Viewer Plus is a Windows Notepad++ view-only, docked offline preview plugin. It supports Markdown/math/code/diagrams, standalone Mermaid and PlantUML, HTML, SVG, JSON/YAML/XML, CSV/TSV, OpenAPI, raster images and PDF.

Text previews use snapshots of the active Scintilla buffer, including unsaved edits. Image/PDF previews use the saved exact file through opaque native-managed resources. Settings persist to a migrated/bounded INI. Runtime WebView2 is an external prerequisite; Node and build tools are not runtime requirements.

Important workflows are editor notification to debounced snapshot, protocol delivery to format dispatch, asynchronous rendering with generation checks, local resource requests, document replacement/revocation, dock visibility, settings/theme changes and shutdown.

## 4. Architecture Overview

~~~text
Notepad++ / Scintilla notifications
  -> PluginEntry / DocumentCoordinator
  -> bounded snapshot + ResourcePolicy registration
  -> MessageBroker / JsonWriter protocol v2
  -> PreviewPanel / WebView2
  -> RendererBridge / ViewerShell / ViewerRegistry
  -> format adapters, parsing, sanitization, bounded trees/CSV
  -> isolated math/diagram frames or exact-file image/PDF viewer

Renderer link messages -> origin-checked MessageBroker
  -> native resource containment policy -> external/local open handler
~~~

Strengths include keeping parsing outside Notepad++ callbacks, a thin native shell, explicit binary sources, format adapters, separate sanitization policies, serial diagram work, and lazy heavy engines. The main architectural weaknesses are missing visibility gating and fragmented lifecycle ownership. The editor process still performs full text copying and JSON preparation on its UI thread.

WebView2 callbacks run on the owning UI thread according to [Microsoft's threading documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model). This supports prioritizing small native callback/snapshot costs; actual installed callback timing remains unmeasured.

## 5. Build and Test Results

Executed from the repository root:

    & .\Build-Development.ps1 -Architecture x64

Passed renderer version synchronization, TypeScript lint, 55 tests across eight files, production build, strict size gate, x64 CMake configuration/Release build, and native CTest.

The helper reconfigured with a fresh CMake cache but initially reused existing compiled outputs. A subsequent full recompilation was therefore performed:

    cmake.exe --build "$env:LOCALAPPDATA\NotepadViewerPlus\development\d902d296cb0e\x64" --config Release --clean-first
    ctest.exe --test-dir "$env:LOCALAPPDATA\NotepadViewerPlus\development\d902d296cb0e\x64" -C Release --output-on-failure --no-tests=error

Both passed. Native CTest contains one combined executable with several regression groups, not one assertion. Clean recompilation produced a 252,416-byte x64 DLL.

Renderer build warnings: PlantUML's url import was externalized for browser compatibility; large optional feature chunks exceed Vite's advisory threshold. Neither failed the build. No new native compiler warning was observed in the emitted build output.

Reported sizes:
- Initial renderer payload: 215,256 bytes raw; 78,430 bytes gzip equivalent.
- Total installed renderer assets: 10,472,172 bytes (9.99 MiB).
- Estimated compressed renderer archive: 3,385,327 bytes. This is an estimate, not a freshly produced ZIP.
- Heavy optional assets: PlantUML 3,599,814 bytes; Viz 1,444,253; Mermaid Tiny 2,898,960; Swagger UI JS 1,425,420.
- These figures exclude WebView2 process memory and installed runtime size. Gzip is a comparison metric; it does not imply local asset requests are compressed.

Read-only Git/status/reference searches and lockfile inventory inspection also ran. Final git status remained clean and git diff --check passed.

Three in-memory probes were run using JavaScript piped into node --input-type=module from renderer/, with Rolldown generate() rather than writing test files:
1. Actual structured JSON viewer in jsdom; unrelated highlight/sanitizer imports were stubs that would throw if called, and were not invoked.
2. Actual math plugin placeholder registration plus real Highlight.js library calls.
3. Actual cached DiagramRenderer renderAll/dispose and PlainTextViewer transitions; URL lifecycle was mocked and the sanitizer bypassed only for an inert SVG fixture. This tests ownership, not sanitization.

Initial exploratory harness attempts failed because TypeScript 7 does not expose the old transpileModule API, and one revised harness omitted require. The harnesses were corrected and completed; these were audit-tool errors, not failed product checks.

Not run: x86 build, release ZIP generation/validator, installer/migration execution, npm audit, live Notepad++ profiling, network capture, visual/PDF smoke checks or rapid-edit stress.

## 6. Findings Summary

| ID | Category | Severity | Confidence | Title | Location |
|----|----------|----------|------------|-------|----------|
| F01 | Performance | High | Confirmed | Hidden dock still refreshes | native/plugin/DocumentCoordinator.cpp:97 |
| F02 | Performance | High | Confirmed | Formula count drives iframe count without a budget | renderer/src/markdown/math.ts:55 |
| F03 | Performance | High | Confirmed cost; installed impact unmeasured | Highlighting lacks size/work limits | renderer/src/markdown/code.ts:103 |
| F04 | Performance | Medium | Confirmed | Diagram URLs survive viewer transitions | renderer/src/diagrams/diagrams.ts:231 |
| F05 | Performance | Medium | Confirmed | Eager subtree copy strings amplify retained data | renderer/src/viewers/structured-viewer.ts:602 |
| F06 | Performance | Medium | Confirmed cost; magnitude unmeasured | Avoidable full native text copies | native/plugin/DocumentCoordinator.cpp:206 |
| F07 | Performance | Medium | Confirmed behavior; impact unmeasured | Browser initializes before preview is used | native/preview/PreviewPanel.cpp:117 |
| F08 | Performance | Medium | Confirmed mechanism; impact unmeasured | Changed diagrams recreate engine realms | renderer/src/ui/app.ts:69 |
| F09 | Security | High | Confirmed | Local links can execute local payloads | native/plugin/PluginEntry.cpp:218 |
| F10 | Security / reliability | Medium | High confidence | Required policy registrations ignore failure | native/preview/PreviewPanel.cpp:302 |
| F11 | Resource lifecycle | Low | Confirmed listener issue | Math timeout cleanup is incomplete | renderer/src/markdown/math.ts:166 |
| F12 | Performance | Medium | High confidence; profiling required | Synchronous Markdown preparation has no complexity budget | renderer/src/markdown/pipeline.ts:81 |
| F13 | Dead code | Low | Confirmed within repository | Small unused declarations and redundant state | native/plugin/DocumentCoordinator.cpp:17 |

## 7. Critical and High Findings

### F01 — Hidden dock still performs the live-preview pipeline

- **Category / Severity / Confidence:** Performance / High / Confirmed.
- **Location:** native/plugin/DocumentCoordinator.cpp:51,97,104,184,206; native/preview/PreviewPanel.cpp:173,529; native/plugin/PluginEntry.cpp:227.
- **Evidence:** Auto-refresh schedules snapshots independently of visibility. Snapshot reads Scintilla text, and QueueDocumentUpdate/SendPendingUpdate send whenever Ready. WM_SHOWWINDOW hides the controller but does not disable the pipeline.
- **Why it matters / Trigger:** Ordinary editing after closing the dock still pays copying, JSON escaping, UTF-16 conversion and hidden preview updates after debounce. Default auto-refresh is enabled.
- **Recommendation:** Gate automatic work before scheduling/snapshotting; retain a dirty marker and perform one fresh update on show. Continue cheap generation invalidation/resource revocation while hidden.
- **Verification:** Hidden edits must cause zero text snapshots and bridge sends; showing must display one fresh current update. Check restored dock state and manual refresh separately.
- **Estimated effort / Change risk / Status:** Small / Low / Confirmed issue. CPU and latency impact not yet measured in Notepad++.

### F02 — Every formula becomes a separate iframe, without a total count limit

- **Category / Severity / Confidence:** Performance / High / Confirmed.
- **Location:** renderer/src/markdown/math.ts:55,115,125,147; renderer/src/markdown/pipeline.ts:34,75; renderer/src/viewers/markdown-viewer.ts:38.
- **Evidence:** The plugin registers every expression; rendering creates and awaits a separate sandboxed frame serially. An in-memory run of the actual plugin produced 1,000 placeholders from 4,000 bytes of "$x$ " repetitions.
- **Why it matters / Trigger:** Formula-heavy documents can create hundreds/thousands of frame documents, channels, font waits and layout contexts far below the 5 MiB host limit. Generation checks do not interrupt the current await.
- **Recommendation:** First impose a formula/frame budget with a readable fallback and deterministic cancellation. Investigate batching within the existing isolated security boundary after profiling.
- **Verification:** Assert bounded frame count, bounded resource cleanup and replacement behavior above the cap; benchmark realistic formula-heavy documents.
- **Estimated effort / Change risk / Status:** Small for a cap, Medium for batching / Medium for geometry/isolation changes / Confirmed issue. No mass-frame browser benchmark was performed.

### F03 — Recognized code fences have no highlighting budget

- **Category / Severity / Confidence:** Performance / High / Confirmed unbounded work and measured library cost; installed latency unmeasured.
- **Location:** renderer/src/markdown/code.ts:79,103,109; renderer/src/markdown/pipeline.ts:69; renderer/src/viewers/markdown-viewer.ts:44.
- **Evidence:** Each recognized fence reaches synchronous hljs.highlight without a per-block or total-byte limit. Node timings for repeated JavaScript source, two runs after a tiny warmup: 100 KiB 56.7/55.1 ms; 1 MiB 483.7/457.6 ms; 5 MiB 3342.4/5592.8 ms. The 5 MiB result contained 26,214,389 HTML characters before DOM insertion.
- **Why it matters / Trigger:** Large recognized fences cause long preview-thread tasks and output expansion. A generation check cannot interrupt one synchronous highlight call. This does not prove an equivalent Notepad++ typing stall.
- **Recommendation:** Set per-block and total highlighting budgets; preserve oversized source as escaped plain code. Yield between bounded blocks where useful. Apply the policy to structured Code view too.
- **Verification:** Test fallback above limits; profile 100 KiB/1 MiB/5 MiB fences in installed WebView2 and rapid replacement.
- **Estimated effort / Change risk / Status:** Small / Low / Confirmed cost; thresholds require product/runtime measurement.

### F09 — Relative links can execute nearby local files through Windows

- **Category / Severity / Confidence:** Security / High / Confirmed by end-to-end code trace.
- **Location:** renderer/src/security/resource-policy.ts:65; native/bridge/MessageBroker.cpp:253,309; native/preview/ResourcePolicy.cpp:85; native/plugin/PluginEntry.cpp:218.
- **Evidence:** A safe relative path is directory-contained but not constrained by target kind. The native handler calls ShellExecuteW with the open verb.
- **Why it matters / Trigger:** An attacker supplies a document bundle containing readme.md and payload.cmd/.exe/.lnk/.url; a deceptively labelled preview link launches it when clicked. The trust boundary crosses from untrusted document content into OS execution. Path containment and a required click mitigate access, but do not prevent execution.
- **Recommendation:** Prefer opening local text targets through Notepad++'s document API. Define a narrow supported policy for other document/media targets; reject directories and execution/shortcut targets rather than shell-dispatching arbitrary paths. A denylist alone is insufficient for arbitrary Windows associations.
- **Verification:** Mock the final open handler and prove executable, script, shortcut and directory targets never reach shell execution; verify intended document links remain useful.
- **Estimated effort / Change risk / Status:** Small–Medium / Medium for link behavior / Confirmed issue. No payload was launched.

No Critical finding was established.

## 8. Medium and Low Findings

### F04 — Diagram Blob URLs are not revoked across every viewer transition

- **Category / Severity / Confidence:** Performance, resource lifecycle / Medium / Confirmed.
- **Location:** renderer/src/diagrams/diagrams.ts:231; renderer/src/viewers/markdown-viewer.ts:27,61,141; renderer/src/viewers/diagram-viewer.ts:25; renderer/src/ui/app.ts:69.
- **Evidence:** Diagram URLs are attached to DOM dataset markers. Only the next Markdown render scans/revokes them. Standalone diagram refreshes and switches to other viewers replace the DOM without revocation. The in-memory probe created 3 URLs, revoked 0, and removed every ownership marker.
- **Why it matters / Trigger:** Repeated diagram refreshes or format transitions retain Blob data until document teardown, increasing session memory.
- **Recommendation:** Centralize URL ownership/cleanup before every root replacement and on disposal. Keep caches separately bounded.
- **Verification:** Exactly-once URL revocation across standalone-to-text and Markdown-to-HTML/PDF transitions; long-session memory profiling.
- **Estimated effort / Change risk / Status:** Small / Low / Confirmed issue; actual retained browser bytes not measured.

### F05 — Copy buttons eagerly serialize entire nested subtrees

- **Category / Severity / Confidence:** Performance, memory / Medium / Confirmed.
- **Location:** renderer/src/viewers/structured-viewer.ts:240,247,288,434,602.
- **Evidence:** Every container Copy button receives JSON.stringify(subtree, null, 2) in a DOM attribute. The root is also formatted for Copy and the hidden Code pane. Actual JSON viewer probe: 263,019-byte input, 50 nesting levels, 32 strings of 8,192 characters; 83 value-copy buttons contained 13,843,767 characters, 52.63 times input length. jsdom construction took 47.3 ms.
- **Why it matters / Trigger:** Large nested documents repeatedly serialize ancestor subtrees and retain strings that may never be copied. Logical character amplification is measured; it is not a measurement of physical heap bytes.
- **Recommendation:** Associate buttons with values outside DOM attributes and serialize on click. Build formatted Code view only when requested.
- **Verification:** Assert no eager subtree serialization during tree construction; compare character/heap/latency metrics on nested fixtures.
- **Estimated effort / Change risk / Status:** Medium / Low / Confirmed issue.

### F06 — Native text preparation makes avoidable full-buffer copies

- **Category / Severity / Confidence:** Performance / Medium / Confirmed cost; magnitude unmeasured.
- **Location:** native/plugin/DocumentCoordinator.cpp:206; native/bridge/JsonWriter.cpp:37,69; native/bridge/MessageBroker.cpp:219.
- **Evidence:** UTF-8 Scintilla text is read into a vector then copied into a string; escaping produces another complete temporary; serialized JSON is converted to UTF-16.
- **Why it matters / Trigger:** Near-limit documents allocate/copy several multi-megabyte buffers on each debounced native refresh.
- **Recommendation:** Read directly into a suitably sized string; append escaped content into a reserved JSON destination. Preserve bounded input validation and the required WebView2 UTF-16 boundary.
- **Verification:** Measure native allocations and UI-thread preparation time for 1/3/5 MiB documents; check encoding/control-character regressions.
- **Estimated effort / Change risk / Status:** Small–Medium / Low / Confirmed avoidable work, runtime prioritization pending measurement.

### F07 — WebView2 is initialized even when preview has never been shown

- **Category / Severity / Confidence:** Performance / Medium / Confirmed mechanism; footprint unmeasured.
- **Location:** native/plugin/PluginEntry.cpp:188,212,234; native/preview/PreviewPanel.cpp:117,133,242.
- **Evidence:** NPPN_READY creates the panel; Create immediately starts the WebView environment regardless of visibility. Newly installed preview starts hidden.
- **Why it matters / Trigger:** Every Notepad++ launch with the plugin installed starts browser machinery and loads the renderer, even for users who do not open the preview.
- **Recommendation:** Preserve dock registration/restoration while deferring browser creation until the panel is visible. Consider supported hidden-session resource reduction after fixing F01.
- **Verification:** Measure cold-start elapsed time, process count/private bytes and idle CPU with preview unused, visible and hidden; verify restored visible docks and readiness remain correct.
- **Estimated effort / Change risk / Status:** Medium / Medium for dock/readiness lifecycle / Profiling candidate; eager initialization is confirmed.

### F08 — Changed diagrams repeatedly initialize fresh engine realms

- **Category / Severity / Confidence:** Performance / Medium / Confirmed mechanism; impact unmeasured.
- **Location:** renderer/src/ui/app.ts:69; renderer/src/diagrams/diagrams.ts:87,95,112,175; renderer/src/diagrams/frame.ts:102.
- **Evidence:** Update disposal removes the diagram iframe. renderAll also cancels its frame. Changed source misses the 32-entry source/theme SVG cache; a new realm imports Mermaid or PlantUML/Viz again.
- **Why it matters / Trigger:** Editing diagram text repeatedly incurs frame/engine initialization; identical cached diagrams avoid this cost. Local browser caches may reduce load/compile costs.
- **Recommendation:** Profile changed-diagram latency before altering cancellation. If material, retain one isolated realm while preserving serial execution, stale-result rejection and safe recovery from stuck engines.
- **Verification:** Compare ten changed-source updates to ten cache hits, engine-init counters, cancellation and shutdown.
- **Estimated effort / Change risk / Status:** Medium / Medium / Manual profiling required.

### F10 — Required WebView2 policy registration failures are not checked

- **Category / Severity / Confidence:** Security, reliability / Medium / High confidence.
- **Location:** native/preview/PreviewPanel.cpp:268,302,332.
- **Evidence:** Synchronous controller creation and add_NavigationStarting/add_WebResourceRequested HRESULTs are ignored; some neighboring mandatory registrations are checked.
- **Why it matters / Trigger:** An uncommon runtime/API registration failure can leave initialization stuck or continue without a required navigation/resource policy. CSP and other handlers remain mitigating controls.
- **Recommendation:** Check required HRESULTs and enter Failed before navigation if a boundary handler cannot be installed.
- **Verification:** Inject registration failures and assert no application navigation and an actionable Failed state.
- **Estimated effort / Change risk / Status:** Small / Low / High-confidence hardening; failure not reproduced.

### F11 — Timed-out math readiness retains listeners

- **Category / Severity / Confidence:** Reliability, resource lifecycle / Low / Confirmed timeout listener retention; port retention requires runtime accounting.
- **Location:** renderer/src/markdown/math.ts:147,153,166,168,169.
- **Evidence:** The readiness timeout rejects without removing its global message listener, which closes over the iframe. Math response ports are not explicitly closed on response/timeout.
- **Why it matters / Trigger:** Repeated failed/superseded frame loads can retain detached frames/listeners for the page lifetime. Successful readiness removes its listener.
- **Recommendation:** Use one settled cleanup path for timeout, error, success and cancellation; deterministically close channels. Address with F02.
- **Verification:** Fake-timer tests asserting balanced add/remove and close calls on every completion path.
- **Estimated effort / Change risk / Status:** Small / Low / Confirmed failure-path issue.

### F12 — Large Markdown preparation remains synchronous

- **Category / Severity / Confidence:** Performance / Medium / High confidence mechanism; runtime impact unmeasured.
- **Location:** renderer/src/markdown/pipeline.ts:28,33,40,81; renderer/src/viewers/markdown-viewer.ts:23; renderer/src/security/sanitize.ts:45.
- **Evidence:** Normalization, MarkdownIt rendering and DOMPurify processing run synchronously without a complexity budget. New generations cannot be processed during a synchronous long task.
- **Why it matters / Trigger:** Large/complex Markdown or HTML may delay preview replacement even with native debounce and stale-result protection.
- **Recommendation:** Benchmark representative inputs first; introduce complexity/fallback policies if necessary. Preserve parser/sanitizer semantics rather than making an unmeasured architectural rewrite.
- **Verification:** WebView2 traces at 100 KiB/1 MiB/5 MiB; p50/p95 preparation/completion time and rapid-generation replacement.
- **Estimated effort / Change risk / Status:** Medium / Medium / Profiling candidate.

### F13 — Small unused declarations and redundant state

- **Category / Severity / Confidence:** Dead code, redundancy / Low / Confirmed within repository.
- **Location:** native/plugin/DocumentCoordinator.cpp:17; native/plugin/PluginConstants.h:10,16; native/preview/ResourcePolicy.h:31 and .cpp:103; native/plugin/PluginEntry.h:57 and .cpp:333; native/bridge/MessageBroker.h:64; renderer/src/diagrams/diagrams.ts:241,243.
- **Evidence:** Four unused default-limit constants; unused kDocumentHost/kDebounceMilliseconds; uncalled ResolveDocumentUri; unused native PreviewUpdate alias; activeToken_ only stores/returns a local intermediate; identical object-URL dataset assignment twice.
- **Why it matters / Trigger:** Minor misleading maintenance surface, with no material demonstrated runtime cost.
- **Recommendation:** Focused cleanup after lifecycle/security work; preserve intended compatibility aliases if external consumption is later established.
- **Verification:** Repository-wide reference searches, native build/CTest and renderer checks.
- **Estimated effort / Change risk / Status:** Small / Low / Confirmed unused internally; externally consumed aliases require verification before deletion.

## 9. Dead, Unused, and Redundant Code Candidates

F13 contains the small confirmed internal candidates. No unused viewer adapter, renderer module or direct runtime dependency was established: registry wiring, dynamic imports and HTML frame entrypoints provide real invocation paths.

Legacy settings names, conflict detection, migration tooling and historical documents are intentional compatibility/history, not automatic deletion candidates. The nineteen production lockfile entries include build/distribution-only transitive material; inventory inclusion does not mean every entry executes in the browser. Two argparse versions are transitive constraints, not evidence of duplicate startup parsers.

The most useful redundancy correction is F05's repeated serialization and F04's fragmented resource ownership, not cosmetic deletion.

## 10. Security Assessment

Confirmed concern: F09 local shell execution. Additional boundary hardening: F10.

Existing strengths:
- Offline default; native request/navigation policy and restrictive CSP.
- Separate sanitization for ordinary HTML, generated math, generated diagrams and standalone SVG.
- HTML has an empty iframe sandbox; math/diagram frames remain script-only opaque-origin sandboxes.
- Exact-file tokens use BCryptGenRandom and buffer/generation binding; relative paths are canonicalized and directory-contained; lifecycle changes revoke bindings.
- XML DTD/entity input is rejected; YAML uses FAILSAFE schema.
- OpenAPI references are same-document only; network/interactive API execution is disabled.
- PDF is a documented separate-origin isolation exception.
- No embedded credential was found in the limited first-party pattern/reference scan.

These are positive controls, not a security certification. No automatic document-load code execution or sanitizer bypass was demonstrated. Live request capture, token revocation/ranges under WebView2, PDF action behavior, and an exhaustive current dependency vulnerability lookup were not verified.

## 11. Performance and Resource Assessment

Measured evidence is restricted to build size and the stated Node/jsdom probes. The strongest product-level priorities are F01, F04, F05 and F02/F03.

The native DLL is small. Heavy features are separated from startup chunks, code grammars are explicitly allowlisted, CSV rows are virtualized, and binary resources are file streams instead of JSON/base64 blobs. These are appropriate lightweight decisions.

Package size does not establish runtime memory efficiency. F07 means browser overhead is currently incurred before preview use; F01 means hiding does not eliminate refresh work. Establish a baseline of Notepad++ plus child WebView processes before setting improvement claims.

Highest-value acceptance measurements:
- Hidden preview: zero automatic snapshots/sends; no accumulating listeners/URLs.
- Cold launch with unused preview: no renderer initialization after lazy lifecycle work.
- Bounded math frames and highlighting work, with readable fallback.
- Repeated viewer transitions: every URL released exactly once; private bytes stabilize after warmup/GC rather than grow indefinitely.
- Editor callback/snapshot elapsed time, preview p50/p95 latency, CPU and private memory across representative sizes and rapid edits.

No claim of installed editor lag, total memory savings or overall speedup is made from these microbenchmarks.

## 12. Testing Assessment

The suite provides useful protocol/origin/resource/command/message-contract coverage and renderer sanitization, format matrix, Unicode limits, theme and math geometry tests. Native checks use explicit failure returns, so Release NDEBUG does not disable their assertions.

Highest-value missing regressions correspond to F01–F05 and F09–F11: hidden work suppression, bounded frame/highlight counts, lazy serialization, cross-viewer cleanup, execution-target restrictions, registration failure and math timeout cleanup.

No benchmark/latency baseline was found in first-party source/test/reference searches. Avoid treating existing small jsdom fixtures as a performance or WebView2 integration test.

## 13. Documentation Assessment

Current architecture/security/syntax material mostly matches the implementation and openly records release/manual limits. The latest viewer-validation-results documents successful math correction; the older handover remains explicitly dated. This audit did not repeat the old square-root defect as current.

Update the local-link security description when F09's policy is selected. Recorded release test counts/package hashes are historical, not today's evidence. README's clickable install default points to a root ZIP while the helper packages under LOCALAPPDATA; handover/setup guides warn about this. Align the headline install instructions with the maintained machine-local flow when next editing documentation.

## 14. Build, Packaging, Dependencies, and Release Assessment

Version synchronization, pinned direct dependencies and integrity-bearing runtime lock entries are strengths. There are nineteen non-development lockfile entries; no missing runtime version/integrity was found. License generation is lockfile-based and structural package validation checks root payload, exports, architecture, version, hashes and unsafe archive paths.

CMake packages renderer/dist, not node_modules or test sources. The WebView2 runtime is not bundled. The maintained OneDrive helper keeps native artifacts machine-local. x64 clean compilation/test succeeded today.

No checked-in CI workflow was found in tracked paths. x86/runtime/install/manual compatibility, source/binary licensing and public release approvals remain separate work. No package was generated or validated during this audit; earlier package reports were not adopted as fresh evidence.

Public maintainer advisory spot searches were insufficient to establish an exhaustive vulnerability result. The previous documented zero-vulnerability npm audit was not rerun and is not claimed for this pass.

## 15. Positive Findings

- Small C++ shell and renderer-owned parsing/untrusted content.
- Full native recompilation and all executed regression checks passed.
- Debounce and a hard text limit; binary content avoids Scintilla text/bridge copies.
- File-stream resource delivery, bounded range parsing and no-store/nosniff headers.
- COM smart pointers, weak callback captures, handler detachment and controller shutdown.
- Effective-theme resolution, preservation of authored artwork colors, and explicit adapter theme behavior.
- Separate lazy heavy engines, WOFF2-only math fonts and language allowlisting.
- CSV virtualization; structured node/depth/string limits.
- Clear isolation documentation, reproducible version identity and evidence-aware release guidance.

## 16. Prioritized Remediation Roadmap

### Immediate

- Close the local execution boundary (F09).
- Correct hidden automatic refresh work (F01).
- Reclaim every diagram URL (F04).

### Short Term

- Defer structured copy/Code serialization (F05).
- Add formula/highlight work budgets and math cleanup (F02/F03/F11).
- Check mandatory WebView registration failures (F10).

### Medium Term

- Measure and defer unused browser startup (F07).
- Reduce avoidable native allocations (F06).
- Profile changed-diagram reinitialization and synchronous Markdown preparation before changing lifecycle/parsing (F08/F12).
- Establish repeatable installed latency/CPU/memory baselines and corresponding regression thresholds.

### Optional

- Remove the small unused declarations/redundant assignments (F13).
- Align install headline documentation and consolidate dated release evidence.

Performance sequencing: eliminate unnecessary work first, bound worst-case work second, then tune measured active-preview costs. Preserve all security/isolation/generation invariants.

## 17. Items Requiring Human Verification

- Installed x64/x86 cold-start, idle, hidden/visible memory and CPU, and editor/preview p95 latency.
- Formula-heavy documents, large fences, repeated format switches and rapid edit/cancel behavior.
- Actual WebView2 range delivery, stale-token revocation and default/opt-in network behavior.
- PDF actions/printing, Swagger CSP behavior, themes, dock restoration, DPI and install/upgrade/restart matrix.
- Final external-opening UX and supported local link policy.
- Current vulnerability advisories and release/license/publication sign-off.

## 18. Limitations and Unreviewed Areas

All major first-party subsystems were inspected across the primary and reviewer passes. Binary fixture/artwork contents, vendored SDK/runtime internals and every dependency implementation were not exhaustively audited. No live user session was manipulated and the installed plugin was not replaced.

Only x64 was built/tested; no fresh ZIP/installer/migration/x86/live UI/visual/network run was performed. Node/jsdom probe timings are not WebView2 timings. Logical string counts and mocked URL balances are not actual process memory measurements. Security concerns were traced without running a malicious local payload.

Application source remained unchanged and Git remained clean at the end of validation. The only audit addition is this user-approved report.
