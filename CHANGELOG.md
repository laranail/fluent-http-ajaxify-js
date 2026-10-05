# Changelog

All notable changes to FluentHttpAjaxify will be documented in this file.

## [Unreleased]

### Added

- Repository scaffolding for publication as `laranail/fluent-http-ajaxify-js`: `CONTRIBUTING.md`,
  `.editorconfig`, a pull-request CI workflow running `npm test`, and
  Dependabot for npm and GitHub Actions.
- `docs/` tree (installation, getting started, architecture, release, `docs/tools/`, `docs/recipes/`).
  The former single-page README content was relocated there unchanged apart from heading case and the
  file-structure listing, which described a Laravel subdirectory that is now its own repository.
- `npm run test:security` runs the standalone security script; `npm test` now runs it after Vitest.

### Changed

- `README.md` is now a short landing page pointing at the docs.
- `package.json` carries `homepage`, `repository`, `bugs` and `types`.
- `LICENSE` copyright holder is Simtabi LLC.
- `SECURITY.md` names GitHub private vulnerability reporting as the preferred channel.
- The superseded v2.1.1 copy of `FluentHttpAjaxify.js` that sat at the repository root moved to
  `archive/FluentHttpAjaxify.root-copy.js`. `assets/js/FluentHttpAjaxify.js` (v3.0.0) is canonical: it is
  what `main` and the tests load, and it is a superset of the root copy.
- `package-lock.json` is no longer tracked (library convention).

### Fixed

- The Vitest loader built `return` + a string beginning with a newline, so automatic semicolon
  insertion returned `undefined` and every suite failed with `fn is not a function` (121 of 121).
- `tests/security.test.js` is a standalone node script that calls `process.exit`; Vitest no longer
  collects it.
- Two tests asserted behaviour the library does not document: `getRegistration()` exposes the name at
  `metadata.name`, and the last middleware pushed is the outermost, as the `MiddlewareStack` docblock
  states.

### Changed

- **The CI test matrix drops Node 20, leaving 22 and 24.** This is a floor for
  testing the package, not for using it. vitest 5 declares
  `engines: ^22.12.0 || ^24.0.0 || >=26.0.0` and jsdom 30 declares
  `^22.22.2 || ^24.15.0 || >=26.0.0`, so `npm install` on the npm that ships with
  Node 20 fails while resolving them — `npm error Cannot read properties of null
  (reading 'edgesOut')` — and no npm upgrade changes that, because the refusal is
  in the packages' own metadata. Node 20 also left support on 2026-04-30.
  `package.json` still declares no `engines`: nothing under `src/` requires Node
  22, so claiming a runtime floor would overstate what was measured.

## [3.0.0] — 2025-06-XX

### Security Hardening (OWASP Top 10)

- **XSS Prevention**: `escapeHtml()`, `sanitizeUrl()`, `sanitizeHtml()` utility functions added
- **CSRF Hardening**: Multi-meta tag detection (`_token`, `csrf-token`, cookie), configurable CSRF header name, double-submit cookie pattern, 419 auto-refresh with retry
- **Prototype Pollution Guards**: `safeAssign()` replaces all `Object.assign` calls — filters `__proto__`, `constructor`, `prototype` keys
- **Token Security**: `SENSITIVE_HEADERS` list with configurable masking in debugger; tokens never fully logged
- **Input Validation**: `validateHeaderValue()` blocks CRLF injection; `sanitizeUrl()` blocks `javascript:`, `data:`, `vbscript:` schemes and HTML-significant characters (`<>"'\``)
- **Secure Communication**: `requireHttps` option enforces HTTPS-only requests; `allowedOrigins` whitelist
- **Request Size Limits**: `maxRequestBodySize` and `maxResponseSize` configurable guards
- **Error Leakage Prevention**: `sanitizeErrorMessage()` strips stack traces, file paths, SQL details from error responses
- **Frozen Statics**: `Object.freeze()` on metadata, messages, and exposed statics to prevent runtime tampering
- **Server Eval Blocked**: `runJavascript` uses `new Function()` (never `eval`) and is disabled by default (`allowServerEval: false`)

### Architecture — Response Protocol

- **`ResponseProtocol` class** — client-side processor for standardized JSON response envelopes
- **Supported directives**: `redirect`, `flash`, `sections`, `scrollTo`, `dump`, `runJavascript`
- **Security**: redirects validated via `sanitizeUrl()`, sections sanitized via `sanitizeHtml()`, JS eval gated by config
- **Wired into both success and error paths** — 422 errors can still trigger flash/sections/redirect
- **Exposed as static**: `FluentHttpAjaxify.ResponseProtocol`

### Architecture — FluentHttpWrapper.js (NEW)

- **High-level convenience patterns** built on FluentHttpAjaxify
- **`saveToDb()`** — POST/PUT with toast feedback, loading state, redirect handling
- **`queryApi()`** — GET with caching, loading state, error toasts
- **`submitForm()`** — delegates to `bindForm()` with wrapper defaults
- **`deleteResource()`** — DELETE with SweetAlert2/confirm dialog, toast, redirect
- **`uploadFile()`** — upload with progress callback and toast
- **`batchActions()`** — parallel or sequential multi-request execution
- **Configurable defaults** and event hooks (`onBeforeSave`, `onAfterSave`, etc.)

### Architecture — Enhanced Form Binding

- **`data-fluent-*` attribute binding** — configure forms declaratively: `data-fluent-action`, `data-fluent-method`, `data-fluent-confirm`, `data-fluent-success-message`, `data-fluent-reset`, `data-fluent-scroll-errors`, `data-fluent-loading-class`, `data-fluent-error-class`, `data-fluent-error-tag`
- **`form.ajax` auto-binding** — forms with `class="ajax"` auto-submit via AJAX (delegated events, laravel-ajax parity)
- **`a.ajax` link auto-binding** — links with `class="ajax"` or `data-fluent-get` send GET via AJAX
- **`button.ajax` auto-binding** — buttons with `class="ajax"` and `data-url` or `data-fluent-post`/`data-fluent-delete`
- **Submit button tracking** — `data-submitted-by` attribute set on form when submit button clicked
- **SweetAlert2 integration** — `data-fluent-confirm` uses `Swal.fire()` if available, falls back to `window.confirm()`
- **`onBeforeSubmit` hook** — async-compatible, return `false` to cancel
- **`onValidationError` callback** — separate from `onError`, receives `(errors, fullError)`
- **`loadingClass`** — CSS class applied to form during submission
- **`scrollToErrors`** — auto-scroll to first invalid field on 422
- **CSS framework auto-detection** — `detectCssFramework()` for Bootstrap 3/4/5, Tailwind CSS, Bulma; configurable via `cssFramework` option

### FluentToast Security & Improvements

- **Removed all `innerHTML` usage** — rebuilt with `createElement`, `textContent`, `appendChild`
- **CSP nonce support** — `detectNonce()` reads from `<meta name="csp-nonce">` or existing `<script nonce>` tags; configurable via `FluentToast.configure({ nonce: '...' })`
- **Accessibility**: `role="alert"`, `aria-live="assertive"` on toast elements
- **Keyboard dismiss** — pressing `Escape` dismisses all visible toasts
- **Adapter validation** — `useAdapter()` now validates required methods (`success`, `error`, `warning`, `info`)
- **New config options**: `nonce`, `styles` (false to skip CSS injection), `customClass`

### Laravel Package (`simtabi/fluent-http-laravel`)

- **`FluentAjax` service** — full laravel-ajax method parity plus enhancements: `is()`, `instance()`, `redirect()`, `redirectBack()`, `redirectWithErrors()`, `redirectRoute()`, `redirectAction()`, `view()`, `redrawView()`, `appendView()`, `prependView()`, `redrawSection()`, `redrawSections()`, `flash()`, `flashFromSession()`, `success()`, `error()`, `warning()`, `info()`, `alert()`, `scrollTo()`, `dump()`, `runJavascript()`, `confirm()`, `closeModal()`, `resetForm()`, `emit()`, `withMeta()`, `setJson()`, `mergeJson()`, `jsonResponse()`
- **Constants**: `VIEW_REDRAW`, `VIEW_APPEND`, `VIEW_PREPEND`
- **`Ajax` facade** with full PHPDoc method annotations
- **`HasFluentAjax` trait** — controller shortcuts: `ajaxSuccess()`, `ajaxError()`, `ajaxRedirect()`, `ajaxValidationError()`, `ajaxSections()`
- **`FluentValidation` trait** — Form Request override for protocol-compatible 422 responses with flash
- **`FluentAjaxMiddleware`** — auto-convert redirect responses to JSON for AJAX requests
- **`InjectCsrfMeta`** — auto-inject `<meta name="csrf-token">` into HTML responses
- **`FluentValidationException`** — custom 422 with protocol format and flash
- **`fluent:install` command** — publish config, assets, views with setup wizard
- **`fluent:publish` command** — publish JS assets to public directory
- **`<x-fluent-scripts />` Blade component** — includes CSRF meta, Axios, all JS files with CSP nonce support
- **Auto-discovery** — service provider and facade auto-registered via `composer.json` extra

### Tests

- **61 security tests** covering escapeHtml, sanitizeUrl, sanitizeHtml, safeAssign, ResponseProtocol, frozen objects, instance security, CSRF methods
- **Laravel package unit tests** for FluentAjax service

### New Utilities

- **`sanitizeFieldName()`** — convert dot-notation to bracket notation (`offices.0.id` → `offices[0][id]`)
- **`extractSingleError()`** — extract first error message from any response shape (protocol, validation, generic)
- **`detectCssFramework()`** — auto-detect Bootstrap 3/4/5, Tailwind, Bulma for error display
- **`.withProtocol()`** — per-request protocol processing opt-in
- **`setSuccessHandler(fn)` / `setErrorHandler(fn)`** — replaceable global handlers
- **HTTP status toasts** — auto-toast for 403 (Permission denied), 404 (Not found), 429 (Rate limited), 500/503 (Server error)
- **`fluent-http-bundle.js`** updated to include `FluentHttpWrapper.js`

### Breaking Changes

- `Object.assign` replaced with `safeAssign` — sources with `__proto__`/`constructor`/`prototype` keys are now filtered
- `FluentToast.show()` no longer uses `innerHTML` — custom HTML in toast messages is no longer rendered (use `textContent` only)
- `runJavascript` protocol directive is now blocked by default — set `allowServerEval: true` to enable
- Version bumped to `3.0.0` in both `_REGISTRATION.metadata` and `package.json`

### Migration Guide (from 2.2.x)

1. **No code changes required** for basic usage — all security features are additive with safe defaults
2. **CSRF**: If you use a custom CSRF header, configure it: `new FluentHttpAjaxify({ security: { csrfHeaderName: 'X-MY-CSRF' } })`
3. **FluentToast**: If you relied on HTML in toast messages, switch to plain text (XSS-safe)
4. **Server eval**: If your server sends `runJavascript`, enable it: `new FluentHttpAjaxify({ security: { allowServerEval: true } })`
5. **Laravel**: Install the companion package: `composer require simtabi/fluent-http-laravel`

---

## [2.2.0] — 2025-01-XX

### Architecture

- **Extracted FluentToast** into standalone `FluentToast.js` module with UMD wrapper
  - 6-position system (top-right, top-left, top-center, bottom-right, bottom-left, bottom-center)
  - Configurable via `FluentToast.configure()` — maxToasts, pauseOnHover, progressBar, newestOnTop, per-type durations
  - Bridge pattern: `FluentToast.bridge(api)` for event-driven HTTP ↔ toast integration
  - Auto-bridges to global FluentHttp instance on `window.load`
  - Exposes `NotificationAdapter`, `createAdapter()`, `detectLibrary()`, `useAdapter()`, `dismissAll()`
- **Replaced embedded toast** in handler with lightweight `ConsoleNotifier` (console-only fallback)
- **NotificationAdapter** in handler now delegates to `FluentToast.createAdapter()` if FluentToast is loaded globally
- **Removed auto-notifier detection** from handler's `autoInit` — now handled by FluentToast's auto-bridge

### Middleware Pipeline (NEW)

- **MiddlewareStack** class — Guzzle-style composable middleware with `push`, `unshift`, `before`, `after`, `remove`, `has`, `resolve`, `list`, `clone`
- **14 built-in middleware factories** via `Middleware.*`:
  1. `validation` — Laravel-style string rules (`required|email|min:3`) + custom functions
  2. `retry` — configurable attempts, delay, exponential backoff, custom retryOn filter
  3. `auth` — dynamic token injection per-request
  4. `logging` — request/response lifecycle logging with custom logger
  5. `cache` — in-memory GET cache with TTL and custom store support
  6. `dedup` — deduplicate identical in-flight GET requests
  7. `history` — record request/response into a container array
  8. `mock` — queued responses (FIFO) or function handler
  9. `mapRequest` — transform config before sending
  10. `mapResponse` — transform result after response
  11. `rateLimit` — max N requests per time window
  12. `guard` — conditional gate that blocks requests failing a predicate
  13. `timeout` — per-middleware timeout override
  14. `transformError` — transform error objects before handlers
- **Instance-level middleware**: `api.getMiddleware().push(Middleware.logging(), 'logging')`
- **Per-request middleware**: `api.post('/users').use(Middleware.validation({...})).send()`
- **Statics exposed**: `FluentHttpAjaxify.Middleware`, `FluentHttpAjaxify.MiddlewareStack`

### Convenience Methods

- `RequestBuilder.withCredentials()` — enable cross-origin cookies
- `RequestBuilder.asFormEncoded()` — set Content-Type to URL-encoded
- `RequestBuilder.download([filename])` — blob response + optional auto-download trigger
- `FluentHttpAjaxify.batch(builders)` — parallel request execution

### Bug Fixes (9 total)

- **Bug 6**: Wrapped `#handleSuccess`/`#handleError` calls in mock, cache, and dedup paths with try-catch
- **Bug 7**: Wrapped `paginate` onPage callback in try-catch
- **Bug 8**: Wrapped `FormHandler` opts.onError/onSuccess in try-catch
- **Bug 9**: Wrapped each OfflineQueue flush callback in try-catch
- **Bug 10**: Wrapped individual success/error callbacks so `#onFinally` always fires
- **Bug 11**: Wrapped global callbacks so failures don't kill notifications
- **Bug 12**: Wrapped `_onRequestHook`/`_onResponseHook` in try-catch
- **Bug 13**: Replaced hard `FluentToast` reference in debugger dump with `_notifierName` string
- **Bug 14**: Added axios existence check at module start with clear error message

### Debug Enhancements

- **Request ID**: Each request gets a unique `req-N` ID shown in debug logs
- **Response size**: Success logs show approximate response size (B/KB)
- Enhanced `requestSuccess()` and `requestError()` with ID tag and size tag in grouped console output

### Production

- `fluent-http-bundle.js` — backward-compatible bundle that loads both handler + toast
- SCSS partials: `_variables`, `_container`, `_toast`, `_progress`, `_colors`, `_dark`
- Framework SCSS: `_bootstrap`, `_tailwind`, `_bulma`
- Pre-compiled `fluent-toast.css`
- `package.json` with vitest dev dependency
- Vitest test suite: unit tests + integration tests + mock-axios helper

### Migration Guide (from 2.1.x)

1. **Toast notifications** are no longer embedded. To restore them:
   - Add `<script src="FluentToast.js"></script>` after the handler script, OR
   - Use `<script src="fluent-http-bundle.js"></script>` (drop-in replacement)
2. **FluentToast auto-bridges** to the global instance — no code changes needed if both scripts load
3. **Manual bridge**: `FluentToast.bridge(api)` for explicit control
4. **Default notifier** is now `ConsoleNotifier` (console.log/error/warn/info) instead of visual toasts
5. `useNotifier()` still works — pass `FluentToast` or any `{ success, error, warning, info }` object
6. **Middleware** is additive — existing code continues to work without changes
