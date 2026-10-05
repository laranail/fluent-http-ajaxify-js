# Static utilities

The static helpers exposed on `FluentHttpAjaxify`.

| Method | Description |
|--------|-------------|
| `FluentHttpAjaxify.create(baseURL?, options?)` | Factory alias |
| `FluentHttpAjaxify.formatError(error)` | Format Axios error → `{ status, message, errors, raw }` |
| `FluentHttpAjaxify.isOnline()` | Check connectivity (`true` in Node.js) |
| `FluentHttpAjaxify.getRegistration()` | Get `_REGISTRATION` object |
| `FluentHttpAjaxify.ready(fn)` | Deferred callback — runs after auto-init |
| `FluentHttpAjaxify.Middleware` | Built-in middleware factories |
| `FluentHttpAjaxify.MiddlewareStack` | MiddlewareStack class |
| `FluentHttpAjaxify.escapeHtml(str)` | Escape HTML entities (v3.0.0) |
| `FluentHttpAjaxify.sanitizeUrl(url)` | Block `javascript:`, `data:`, `vbscript:` schemes (v3.0.0) |
| `FluentHttpAjaxify.sanitizeHtml(html, mode?)` | Sanitize HTML — `'strict'`, `'basic'`, or `'none'` (v3.0.0) |
| `FluentHttpAjaxify.safeAssign(target, ...sources)` | Prototype-pollution-safe `Object.assign` (v3.0.0) |
| `FluentHttpAjaxify.sanitizeFieldName(name)` | Dot-notation → bracket notation (v3.0.0) |
| `FluentHttpAjaxify.extractSingleError(response)` | First error message from any response shape (v3.0.0) |
| `FluentHttpAjaxify.detectCssFramework(configured?)` | Auto-detect BS3/4/5, Tailwind, Bulma (v3.0.0) |
| `FluentHttpAjaxify.ResponseProtocol` | Client-side response protocol processor (v3.0.0) |

---

[← Docs index](../../README.md#documentation)
