# Notifications

FluentToast, external toast libraries, and automatic or per-request notification.

## FluentToast (standalone module — v2.2.0+)

Toast notifications are now in a **standalone `FluentToast.js`** module. Load it alongside the handler:

```html
<script src="axios.min.js"></script>
<script src="FluentHttpAjaxify.js"></script>
<script src="FluentToast.js"></script>  <!-- auto-bridges to global instance -->
```

Or use the backward-compatible bundle:

```html
<script src="axios.min.js"></script>
<script src="fluent-http-bundle.js"></script>
```

**FluentToast features:**
- **6 positions**: top-right, top-left, top-center, bottom-right, bottom-left, bottom-center
- **Configurable**: `FluentToast.configure({ position, maxToasts, pauseOnHover, progressBar, newestOnTop, duration })`
- **Bridge pattern**: `FluentToast.bridge(api)` for event-driven integration
- **Auto-bridge**: Automatically connects to `window.FluentHttp` on load
- **Dark mode**: Auto-detects `prefers-color-scheme: dark`
- **Dismiss all**: `FluentToast.dismissAll()`

```js
// Configure toast behavior
FluentToast.configure({
  position: 'bottom-right',
  maxToasts: 5,
  pauseOnHover: true,
  progressBar: true,
  duration: { success: 3000, error: 6000 },
});

// Manual bridge to a specific instance
FluentToast.bridge(api);
```

Without FluentToast loaded, the handler falls back to `ConsoleNotifier` (console.log/error/warn/info).

## External libraries (opt-in)

To use an external toast library:

```js
api.useNotifier('toastr');       // use Toastr
api.useNotifier('sweetalert2');  // use SweetAlert2
api.useNotifier('notyf');        // use Notyf
api.useNotifier('izitoast');     // use iziToast
api.useNotifier('console');      // console-only (Node.js / headless)

// Or provide a custom adapter
api.useNotifier({
  success: (msg) => myToast(msg, 'success'),
  error:   (msg) => myToast(msg, 'error'),
  warning: (msg) => myToast(msg, 'warning'),
  info:    (msg) => myToast(msg, 'info'),
});
```

## Global auto-notify

```js
api.autoNotify({
  success: false,                     // don't toast on success by default
  error: true,                        // toast error.message on failure
  validation: 'Please fix the errors below',  // toast on 422
  networkError: 'No internet connection',      // toast on network error
});
```

## Per-request notify

```js
await api.post('/users')
  .withBody(data)
  .notify({ success: 'Saved!', error: 'Could not save' })
  .send();

// Or just: .notify(true) for default messages
```

---

[← Docs index](../../README.md#documentation)
