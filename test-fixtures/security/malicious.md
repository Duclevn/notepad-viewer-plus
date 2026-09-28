<script>alert('xss')</script>

<a href="javascript:alert('xss')" onclick="alert('xss')">unsafe</a>

![outside](../../../../Windows/System32/config/SAM)

```mermaid
flowchart LR
    A -->|<img src=x onerror=alert(1)>| B
```

```plantuml
@startuml
!includeurl https://example.invalid/remote.puml
@enduml
```

```html
<svg><script>alert(1)</script><foreignObject>unsafe</foreignObject></svg>
```
