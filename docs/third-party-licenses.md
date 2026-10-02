# Third-party runtime inventory

Versions are pinned in `renderer/package-lock.json`. This list covers the primary production renderer dependencies; the generated inventory also includes every non-development transitive package from the lockfile (19 packages in the current lock). Development-only dependencies are not shipped in a release package.

| Package | Version | License | Runtime role |
|---|---:|---|---|
| `@plantuml/core` | 1.2026.8 | MIT | Offline PlantUML engine and Viz.js layout runtime |
| `@mermaid-js/tiny` | 12.0.0 | MIT | Offline Mermaid Tiny runtime; packaged as `vendor/mermaid-tiny.js` |
| `dompurify` | 3.4.16 | MPL-2.0 OR Apache-2.0 | HTML, MathML, and SVG sanitization |
| `highlight.js` | 11.12.0 | BSD-3-Clause | Explicitly allowlisted lazy code grammars |
| `js-yaml` | 4.3.2 | MIT | Safe-schema front matter parsing |
| `katex` | 0.18.9 | MIT | Lazy local math renderer |
| `markdown-it` | 15.0.2 | MIT | Markdown parser |
| `markdown-it-container` | 4.0.0 | MIT | Container admonition blocks |
| `swagger-ui-dist` | 5.33.0 | Apache-2.0 | Lazy, locally bundled documentation-only OpenAPI viewer |

The exact license texts used for release verification are copied from each production package's license file into `THIRD-PARTY-LICENSES.txt` by the packaging workflow. The generator fails when a lockfile production package has no package metadata or license file. Do not replace `@plantuml/core` with the historical GPL site/demo build or add its optional demo assets to the release. The lockfile also records the production transitive packages brought by Swagger UI; all are included in the generated inventory.
