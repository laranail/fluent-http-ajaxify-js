# Getting started

Load the client, let it configure itself from `<meta>` tags, and send a first request.

## Zero-config (any framework)

Drop the script in, add one `<meta>` tag, and you're done:

```html
<meta name="csrf-token" content="YOUR_CSRF_TOKEN">
<meta name="api-base-url" content="/api">

<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script src="/js/FluentHttpAjaxify.js"></script>

<script>
  // Two globals are available:
  //   window.FluentHttpAjaxify — the class (always available)
  //   window.FluentHttp             — auto-created instance (shorthand)
  const { data } = await FluentHttp.get('/users').send();
</script>
```

The script auto-detects:
- **CSRF token** from `<meta name="csrf-token">` (used by Laravel, Rails, Django, Phoenix, etc.)
- **Base URL** from `<meta name="api-base-url">`
- **Auth token** from `<meta name="api-token">` (optional)
- **Debug mode** from `<meta name="fluent-debug" content="true">` (optional)
- **Toast notifications** if FluentToast.js is loaded (auto-bridges)

## Manual setup

```html
<script>
  const api = new FluentHttpAjaxify({
    baseURL: '/api',
    token: localStorage.getItem('auth_token'),
    debug: true,
    concurrency: 4,
    history: 50,
  });
</script>
```

## Deferred (before DOM ready)

```html
<script>
  // Safe even if called before auto-init completes
  FluentHttpAjaxify.ready(function (api) {
    api.get('/users').send();
  });
</script>
```

## ES module

```js
import FluentHttpAjaxify from './FluentHttpAjaxify.js';
const api = new FluentHttpAjaxify({ baseURL: '/api' });
```

## CommonJS (Node.js)

```js
const FluentHttpAjaxify = require('./FluentHttpAjaxify');
const api = new FluentHttpAjaxify({ baseURL: 'https://myapp.test/api' });
```

## Features

| Category | Features |
|----------|----------|
| **Core** | Fluent builder, constructor + factory, `_REGISTRATION` config pattern, `{ data, error, status }` return (never throws) |
| **Middleware** | Guzzle-style `MiddlewareStack` with 14 built-in factories — validation, retry, auth, logging, cache, dedup, history, mock, mapRequest, mapResponse, rateLimit, guard, timeout, transformError |
| **Smart Auto-Init** | Auto-detect config from `<meta>` tags, auto-create global instance, auto-bind forms |
| **Events** | Instance + per-request event emitter: `success`, `error`, `error:422`, `validation`, `start`, `complete`, `retry`, `offline:queued` |
| **Toast (standalone)** | FluentToast.js — extracted standalone module with 6-position system, config API, bridge pattern, pause-on-hover, progress bar. Auto-bridges if loaded |
| **Smart Debug** | Console debugger with 5 log levels, color-coded output, request IDs, response size tracking, token masking, `dump()` + `inspect()` |
| **Form Binding** | `.bindForm()` + `data-fluent-*` auto-bind. Serializes fields, submits via AJAX, displays 422 errors on inputs |
| **Auth** | Global + per-request Bearer token, CSRF token, auto-detect `<meta>` tag |
| **Upload** | `.withFile()` / `.withFiles()` — auto FormData, correct multipart boundary |
| **Cancellation** | `.cancelWith(controller)` / `.abortable()` — AbortController support |
| **Retry** | `.retry(n, delay, { exponential })` — auto-retry with backoff, skips 4xx |
| **Caching** | `.cache(ttl)` — in-memory GET caching with TTL |
| **Deduplication** | Identical in-flight GETs share one promise (with per-request callback fix) |
| **Token Refresh** | `.onUnauthorized(fn)` — auto-refresh + replay on 401 |
| **Concurrency** | `.withConcurrency(n)` — semaphore-based request queue |
| **Timeout** | Per-request `.withTimeout(ms)` override |
| **Response Types** | `.asBlob()`, `.asText()`, `.asArrayBuffer()`, `.asStream()`, `.asJson()`, `.asHtml()`, `.asAny()` |
| **Pagination** | `.paginate()` — auto-walk paginated APIs |
| **Batch** | `.batch([builders])` — parallel request execution |
| **Logging** | `.onRequest(fn)` / `.onResponse(fn)` hooks + event-based telemetry |
| **Mock Mode** | `.mock(routeMap)` — intercept requests for unit testing |
| **Offline** | Queue requests when offline, auto-flush on reconnect |
| **Progress** | `.onProgress(fn)` — upload/download percentage |
| **History** | `.getHistory()` — request log for debugging |
| **Method Override** | `.withMethodOverride()` — `X-HTTP-Method-Override` for restrictive proxies |
| **Clone** | `.clone()` — duplicate a builder for request variants |
| **Convenience** | `.withCredentials()`, `.asFormEncoded()`, `.download(filename)` |
| **TypeScript** | Full `.d.ts` type definitions with typed events |
| **UMD** | Works as `<script>`, ESM `import`, or CommonJS `require()` |
| **Framework-Agnostic** | Works with Laravel, Rails, Django, Express, Phoenix, or standalone — zero framework lock-in |

---

[← Docs index](../README.md#documentation)
