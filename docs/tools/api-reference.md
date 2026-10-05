# API reference

The constructor, the instance methods, the request builder, and the shape every request resolves to.

## `new FluentHttpAjaxify(config?)`

| Config Property | Type | Default | Description |
|-----------------|------|---------|-------------|
| `baseURL` | `string` | `''` | Base URL prepended to all endpoints |
| `csrf` | `string` | auto-detect | CSRF token (reads `<meta>` tag if omitted) |
| `token` | `string` | — | Global Bearer token |
| `tokenScheme` | `string` | `'Bearer'` | Authorization scheme |
| `timeout` | `number` | `10000` | Default timeout (ms) |
| `defaultHeaders` | `object` | `{}` | Headers for all requests |
| `debug` | `boolean\|string` | `false` | Log level: `true`→`'info'`, `'verbose'`, `'warn'`, `'error'`, `false`→`'silent'` |
| `offline` | `boolean` | `false` | Offline queue |
| `concurrency` | `number` | `0` (unlimited) | Max parallel requests |
| `history` | `number` | `0` (disabled) | Max history entries |
| `smart` | `object` | see below | Smart auto-init overrides |

### Smart config

| Property | Default | Description |
|----------|---------|-------------|
| `smart.autoInit` | `true` | Auto-read meta tags on DOMContentLoaded |
| `smart.autoBindForms` | `true` | Auto-bind `data-fluent-*` forms |
| `smart.autoNotifier` | `true` | Auto-detect toast library on window.load |
| `smart.globalName` | `'FluentHttp'` | Window property name for auto-instance |
| `smart.metaPrefix` | `''` | Prefix for meta tag names |

## `FluentHttpAjaxify.create(baseURL?, options?)`

Static factory — convenience alias for `new FluentHttpAjaxify(config)`.

## Instance methods (chainable)

| Method | Description |
|--------|-------------|
| `.withCsrf(token)` | Set CSRF token globally |
| `.withToken(token, scheme?)` | Set Bearer token globally |
| `.withDefaultHeaders(headers)` | Merge default headers |
| `.withConcurrency(n)` | Set max concurrent requests |
| `.debug(level?)` | Set debug level (`true`/`false`/`'silent'`/`'error'`/`'warn'`/`'info'`/`'verbose'`) |
| `.dump()` | Print structured instance state snapshot to console |
| `.onSuccess(fn)` | Global success hook (backward compat) |
| `.onError(fn)` | Global error hook (backward compat) |
| `.onUnauthorized(fn)` | 401 handler — auto-refresh + replay |
| `.onRequest(fn)` | Pre-request hook (backward compat) |
| `.onResponse(fn)` | Post-response hook (backward compat) |
| `.mock(routeMap)` | Enable mock mode |
| `.clearCache()` | Clear cached responses |
| `.on(event, fn)` | Instance-level event listener |
| `.once(event, fn)` | One-shot event listener |
| `.off(event, fn?)` | Remove event listener(s) |
| `.emit(event, payload?)` | Manually emit an event |
| `.useNotifier(driver)` | Set notification adapter |
| `.getMiddleware()` | Get instance-level `MiddlewareStack` |
| `.batch(builders)` | Execute multiple builders in parallel |
| `.autoNotify(opts)` | Configure auto-notification |
| `.bindForm(selector, opts?)` | Bind form for AJAX submission |
| `.getHistory()` | Get request history log |
| `.clearHistory()` | Clear history log |

## Request starters

| Method | Description |
|--------|-------------|
| `.get(endpoint, params?)` | Start GET builder |
| `.post(endpoint, data?)` | Start POST builder |
| `.put(endpoint, data?)` | Start PUT builder |
| `.patch(endpoint, data?)` | Start PATCH builder |
| `.delete(endpoint, data?)` | Start DELETE builder |
| `.head(endpoint, params?)` | Start HEAD builder |
| `.options(endpoint)` | Start OPTIONS builder |
| `.upload(endpoint, formData)` | Start upload (POST + FormData) |

## Builder methods (chainable)

| Method | Description |
|--------|-------------|
| `.withBody(data)` | Set request body |
| `.withHeader(key, value)` | Set single header |
| `.withHeaders(headers)` | Merge headers |
| `.withParam(key, value)` | Set single query param |
| `.withParams(params)` | Merge query params |
| `.withToken(token, scheme?)` | Override auth for this request |
| `.withCsrf(token)` | Override CSRF for this request |
| `.withFile(fieldName, file)` | Attach file (auto FormData) |
| `.withFiles(files)` | Attach multiple files |
| `.withOptions(opts)` | Merge arbitrary Axios config (escape hatch) |
| `.withMethodOverride()` | Send as POST with `X-HTTP-Method-Override` |
| `.cancelWith(controller)` | Attach AbortController |
| `.abortable()` | Create + return AbortController |
| `.retry(attempts?, delay?, opts?)` | Enable retry with backoff |
| `.cache(ttlSeconds)` | Cache response (GET only) |
| `.withTimeout(ms)` | Override timeout |
| `.asBlob()` | Expect Blob response |
| `.asText()` | Expect text response |
| `.asArrayBuffer()` | Expect ArrayBuffer response |
| `.asStream()` | Expect stream (Node.js) |
| `.asJson()` | Set Accept: `application/json` |
| `.asHtml()` | Set Accept: `text/html` |
| `.asAny()` | Set Accept: `*/*` |
| `.onSuccess(fn)` | Per-request success callback |
| `.onError(fn)` | Per-request error callback |
| `.onFinally(fn)` | Per-request finally callback |
| `.onProgress(fn)` | Upload/download progress (0–100) |
| `.on(event, fn)` | Per-request event listener |
| `.once(event, fn)` | Per-request one-shot listener |
| `.onStart(fn)` | Shorthand for `.on('start', fn)` |
| `.onComplete(fn)` | Shorthand for `.on('complete', fn)` |
| `.notify(opts?)` | Enable toast notifications for this request |
| `.withCredentials()` | Enable cross-origin cookies for this request |
| `.asFormEncoded()` | Set Content-Type to URL-encoded form |
| `.download(filename?)` | Set response to blob + optional auto-download trigger |
| `.use(middleware, name?)` | Add per-request middleware |
| `.clone()` | Clone builder into new unsent copy |
| `.inspect()` | Print builder config to console (without executing) |

## Execution

| Method | Description |
|--------|-------------|
| `.send()` | Execute request → `{ data, error, status }` |
| `.paginate(options?)` | Auto-paginate → `{ data: [], error, status }` |
| `await builder` | Thenable — same as `.send()` without calling it |

## Return shape

Every `.send()` returns a consistent object — **never throws**:

```js
const { data, error, status } = await api.get('/users').send();

// data   — response payload, or null on failure
// error  — { status, message, errors, raw }, or null on success
// status — HTTP status code (0 = network, -1 = config)
```

---

[← Docs index](../../README.md#documentation)
