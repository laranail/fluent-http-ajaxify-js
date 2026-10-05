# laranail/fluent-http-ajaxify-js

[![Tests](https://github.com/laranail/fluent-http-ajaxify-js/actions/workflows/ci.yml/badge.svg)](https://github.com/laranail/fluent-http-ajaxify-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Two badges, not four: the package is not on npm yet, so there is no registry version to show, and
there is no separate static-analysis job.

> A fluent, chainable HTTP client built on Axios, with a middleware pipeline, toast notifications, form binding and smart auto-init.

Plain UMD files with no build step: load them with a `<script>` tag, `require()` or AMD. The only
runtime dependency is Axios 0.21 or later.

## Install

The package is not published to npm. Copy the files from `assets/` into your public assets, or, in
a Laravel application, install [`laranail/fluent-http-ajaxify-laravel`](https://github.com/laranail/fluent-http-ajaxify-laravel),
which ships these files and publishes them for you.

```html
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script src="/js/FluentToast.js"></script>
<script src="/js/FluentHttpAjaxify.js"></script>
```

## Quick start guide and usage

### Getting started

Load Axios before the client, then declare a base URL in a `<meta>` tag. On `DOMContentLoaded` the
client reads it, along with the CSRF token, and creates a global instance named `FluentHttp`;
without the base-URL tag it creates none, and you construct one yourself with
`new FluentHttpAjaxify({ baseURL: '/api' })`. `FluentToast.js` and `assets/css/fluent-toast.css` are
optional; when loaded, the client routes notifications through them.

```html
<meta name="csrf-token" content="YOUR_CSRF_TOKEN">
<meta name="api-base-url" content="/api">
```

### Usage

```js
// Never throws: every request resolves to { data, error, status }.
const { data, error } = await FluentHttp.post('/users')
  .withBody({ name: 'Imani' })
  .notify({ success: 'User created', error: 'Could not create the user' })
  .send();
```

The full walkthrough is in [docs/getting-started.md](docs/getting-started.md); everything else is
indexed under [Documentation](#documentation).

## <a name="documentation"></a>Documentation

Hosted at <https://opensource.simtabi.com/documentation/laranail/fluent-http-ajaxify-js/>.

### Guides

- [Installation](docs/installation.md) — requirements, loading the scripts, Laravel wiring
- [Getting started](docs/getting-started.md) — zero-config, manual and module setup, feature list
- [Architecture](docs/architecture.md) — the UMD file, `_REGISTRATION`, file layout
- [Release](docs/release.md) — version history, migration notes, cutting a release

### Reference

- [API reference](docs/tools/api-reference.md) — constructor, instance and builder methods, return shape
- [Events](docs/tools/events.md) — instance and per-request events
- [Middleware pipeline](docs/tools/middleware.md) — `MiddlewareStack`, built-in factories, validation rules
- [Notifications](docs/tools/notifications.md) — FluentToast, external libraries, auto-notify
- [Debugging and inspection](docs/tools/debugging.md) — log levels, `dump()`, `inspect()`
- [Form binding](docs/tools/form-binding.md) — `bindForm()`, `data-fluent-*`, 422 errors
- [History, method override and clone](docs/tools/builder-utilities.md) — three builder features
- [Static utilities](docs/tools/static-utilities.md) — helpers on `FluentHttpAjaxify`

### Recipes

- [File upload with progress](docs/recipes/file-upload-with-progress.md) — multipart upload with a progress callback
- [Request cancellation](docs/recipes/request-cancellation.md) — abort with an `AbortController`
- [Retry with exponential backoff](docs/recipes/retry-with-exponential-backoff.md) — retry 5xx with a growing delay
- [Token refresh on 401](docs/recipes/token-refresh-on-401.md) — refresh and replay
- [Pagination](docs/recipes/pagination.md) — walk every page
- [Mock mode](docs/recipes/mock-mode.md) — intercept requests in tests
- [Offline queue](docs/recipes/offline-queue.md) — queue while offline, flush on reconnect
- [Escape hatch with `withOptions()`](docs/recipes/escape-hatch.md) — raw Axios options

### Project

- [CHANGELOG](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

`archive/FluentHttpAjaxify.root-copy.js` is a superseded v2.1.1 copy of the client that used to sit at
the repository root. Nothing loads it; it is kept so no code is lost, and can be deleted once nobody needs it.

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities through GitHub private vulnerability
reporting or to `security@simtabi.com`, as described in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
