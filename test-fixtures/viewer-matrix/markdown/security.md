# Untrusted Markdown

<script>alert('markdown-xss')</script>

<a href="javascript:alert('xss')" onclick="alert('xss')">unsafe link</a>

![remote](https://assets.example.invalid/image.png)

```html
<svg><script>alert(1)</script><foreignObject>unsafe</foreignObject></svg>
```
