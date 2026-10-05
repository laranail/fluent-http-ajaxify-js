# Debugging and inspection

Five log levels, the console debugger, `dump()` and `inspect()`.

FluentHttpAjaxify includes a professional-grade console debug system with 5 log levels, color-coded grouped output, token masking, and state inspection.

## Log levels

| Level | What's logged |
|-------|---------------|
| `'silent'` | Nothing (default) |
| `'error'` | Failed requests only |
| `'warn'` | + warnings (422, retries) |
| `'info'` | + request lifecycle (method, URL, status, duration) |
| `'verbose'` | + headers, payloads, cache hits, dedup |

```js
// Enable via constructor
const api = new FluentHttpAjaxify({ baseURL: '/api', debug: 'verbose' });

// Or toggle at runtime
api.debug(true);        // → 'info' (backward compat)
api.debug('verbose');   // → verbose mode
api.debug(false);       // → 'silent'
```

## Console output

With `debug: 'info'`, every request produces a collapsed console group:

```
▶ [FluentHttp] POST /api/users → 201 (45ms)
    → Headers: { Authorization: "Bearer ***abc", Content-Type: "application/json" }
    → Body: { name: "Imani", email: "imani@test.com" }
    ← Data: { id: 42, name: "Imani" }
```

- **Color-coded**: green (2xx), red (4xx/5xx), orange (422/retry), blue (cache/dedup)
- **Token masking**: Bearer tokens auto-masked (`Bearer ***abc`)
- **Payload truncation**: Large payloads abbreviated (first 500 chars)

## `dump()` — instance state snapshot

Print the entire instance state to the console (works at any debug level):

```js
api.dump();
```

Output:
```
══ FluentHttpAjaxify State ══
Base URL:       /api
Debug Level:    info
CSRF:           ✓ (set)
Token:          ✓ Bearer ***abc
Timeout:        10000ms
Concurrency:    4 (enabled)
Offline Queue:  0 pending
History:        12 entries (max 50)
Notifier:       builtin (FluentToast)
Bound Forms:    2
Mock Mode:      ✗
── Performance ──
Total Requests: 47
Total Errors:   3
Avg Duration:   89ms
═══════════════════════════════════
```

## `inspect()` — builder config preview

Print a request builder's config without executing (works at any debug level):

```js
api.patch('/users/42')
  .withBody({ name: 'Updated' })
  .retry(3, 500, { exponential: true })
  .notify({ success: 'Saved!' })
  .inspect()   // logs config, does NOT execute
  .send();     // now actually sends
```

---

[← Docs index](../../README.md#documentation)
