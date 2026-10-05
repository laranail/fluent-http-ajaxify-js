# Events

Seven event names, emitted per instance and per request.

Both the instance and individual request builders support typed events.

## Supported events

| Event | Payload | When |
|-------|---------|------|
| `success` | `{ data, response, status }` | Request succeeded |
| `error` | `{ error, status }` | Request failed (any reason) |
| `error:{code}` | `{ error }` | Specific HTTP error (e.g. `error:404`, `error:500`) |
| `error:network` | `{ error }` | No response received |
| `error:timeout` | `{ error }` | Request timed out |
| `error:cancelled` | `{ error }` | Request was aborted |
| `validation` | `{ errors, message, status: 422 }` | Laravel 422 validation error |
| `start` | `{ method, url }` | Request started |
| `complete` | `{ method, url, status, duration }` | Request finished (success or error) |
| `request` | `{ method, url, params, headers, body }` | Pre-request details |
| `response` | `{ method, url, status, duration, data }` | Post-response details |
| `retry` | `{ attempt, maxAttempts, delay, error }` | Retry triggered |
| `offline:queued` | `{ method, url }` | Request queued while offline |

## Instance-level events

```js
// Fires for ALL requests from this instance
api.on('error:422', ({ errors, message }) => {
  console.warn('Validation failed:', message, errors);
});

api.on('error:network', () => {
  showBanner('You appear to be offline');
});

api.on('complete', ({ method, url, status, duration }) => {
  analytics.track('api_call', { method, url, status, duration });
});
```

## Per-request events

```js
const { data } = await api.post('/users')
  .withBody(formData)
  .on('start', () => showSpinner())
  .on('complete', () => hideSpinner())
  .on('validation', ({ errors }) => displayFieldErrors(errors))
  .on('success', ({ data }) => showToast('User created!'))
  .send();
```

---

[← Docs index](../../README.md#documentation)
