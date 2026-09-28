# ADR-0002 — Phase 2 frame and resource isolation

**Status:** Accepted for the main shell and HTML/SVG viewers; PDF viewer decision remains pending compatibility smoke testing.
**Date:** 2026-02-01

## Context

Phase 2 adds viewers for untrusted HTML, standalone SVG, OpenAPI descriptions, images, and PDFs. These formats must not turn the preview into a browser, expose an absolute path, or create a network path around the native resource policy.

## Decision

The main application uses this policy:

```text
default-src 'none';
script-src 'self';
style-src 'self';
font-src 'self';
img-src 'self' blob: data: https://doc.local https:;
connect-src 'none';
object-src 'none';
frame-src 'self' https://doc.local;
base-uri 'none';
form-action 'none';
navigate-to 'none';
```

The native WebView2 request policy remains authoritative. HTTPS image requests are blocked unless the explicit remote-image setting is enabled. All other network, file, WebSocket, and navigation requests are denied. The top-level navigation handler accepts only `https://app.local/index.html`; diagram/math frames and the active exact PDF resource are admitted only through the child-frame navigation event, so an exact PDF token cannot replace the application page.

HTML is placed in an iframe with an empty `sandbox` attribute: no scripts, same-origin access, forms, popups, downloads, top navigation, or user activation delegation. The frame receives its own policy:

```text
default-src 'none';
img-src https://doc.local data:;
style-src 'none';
script-src 'none';
connect-src 'none';
form-action 'none';
base-uri 'none';
object-src 'none';
```

Author CSS is omitted until a separately reviewed CSS sanitizer exists. HTML images are rewritten to the constrained `doc.local` directory service; external HTML resources are removed. The HTML adapter has no frame message channel. If a future frame message channel is added, handlers must require `event.source === frame.contentWindow` and validate a versioned schema.

Standalone SVG is parsed as XML, stripped of active elements/event attributes/external references, dimension-bounded, converted to a Blob URL, and displayed through an image element. Generated diagram SVG continues to use the stricter diagram policy. Diagram frames use an opaque-origin `sandbox="allow-scripts"`, so their `postMessage` target is necessarily `*`; the parent verifies `event.source === frame.contentWindow`, validates the ready/response schema, and sends render results through a transferred `MessagePort`.

OpenAPI specifications are parsed in memory. Every `$ref` is checked before rendering and only same-document fragments are accepted. A pinned Swagger UI distribution is loaded as a local lazy chunk with an in-memory `spec`; it is documentation-only with no Try It Out, validator, config URL, authorization persistence, OAuth redirect, remote definition, or network request path. All specification strings are sanitized before they are passed to the UI, and a safe local summary fallback is used when the chunk cannot load.

No Blob worker or PDF.js worker is authorized by this ADR. The PDF decision is a separate spike: either a built-in WebView2 PDF resource or a local PDF.js bundle may be selected only after measuring offline behavior, range requests, view-only controls, CSP, package size, memory, and x64/Win32 smoke behavior. If PDF.js is selected, this ADR must be amended with an explicit local worker/font/map policy and regression tests before release.

## Security regression matrix

| Area | Required check |
|---|---|
| HTML | script/event/form/iframe/object removal; empty sandbox; no external image; no navigation |
| SVG | script/event/`foreignObject`/external URL removal; dimensions bounded; Blob image only |
| OpenAPI | remote and cross-file `$ref` rejected before rendering; descriptions sanitized; no API calls |
| Resource service | opaque token only; canonical path and active generation required; no traversal; no stale token |
| Network | no unexpected HTTP(S), WebSocket, file, or local-server request |
| Generation | replacement revokes Blob URLs and stale frame/diagram work cannot commit |
| PDF | range response, corrupt/large file, replacement/revocation, and manual compatibility smoke test |

## Consequences

The first Phase 2 increment is intentionally a safe local viewer, not a general-purpose browser. The strict CSP and native interception may reject features that require author scripts/CSS, remote references, or interactive PDF actions. Those features require a new decision rather than a policy relaxation.
