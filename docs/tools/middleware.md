# Middleware pipeline

The Guzzle-style `MiddlewareStack`: instance and per-request middleware, 14 built-in factories, and validation rules.

FluentHttpAjaxify includes a **Guzzle-style middleware pipeline** that wraps the request/response lifecycle.

## Instance-level middleware

Applies to ALL requests from an instance:

```js
const { Middleware } = FluentHttpAjaxify;

api.getMiddleware().push(Middleware.logging(), 'logging');
api.getMiddleware().push(Middleware.retry({ attempts: 3, delay: 500 }), 'retry');
api.getMiddleware().push(Middleware.auth(() => localStorage.getItem('token')), 'auth');
```

## Per-request middleware

Applies to a single request only:

```js
await api.post('/users')
  .use(Middleware.validation({ email: 'required|email', name: 'required|min:2' }))
  .use(Middleware.timeout(5000))
  .send();
```

## Built-in middleware factories

| Factory | Description |
|---------|-------------|
| `Middleware.validation(rules)` | Laravel-style string rules (`required\|email\|min:3`) + custom functions |
| `Middleware.retry(opts)` | Configurable attempts, delay, exponential backoff |
| `Middleware.auth(tokenFn, scheme?)` | Dynamic token injection |
| `Middleware.logging(logger?)` | Request/response lifecycle logging |
| `Middleware.cache(opts)` | In-memory GET cache with TTL |
| `Middleware.dedup()` | Deduplicate identical in-flight GETs |
| `Middleware.history(container)` | Record entries into an array |
| `Middleware.mock(responses)` | Queued responses or function handler |
| `Middleware.mapRequest(fn)` | Transform config before sending |
| `Middleware.mapResponse(fn)` | Transform result after response |
| `Middleware.rateLimit(opts)` | Max N requests per time window |
| `Middleware.guard(predicate)` | Block requests failing a condition |
| `Middleware.timeout(ms)` | Override timeout per-middleware |
| `Middleware.transformError(fn)` | Transform error objects |

## MiddlewareStack API

| Method | Description |
|--------|-------------|
| `.push(fn, name?)` | Add to end |
| `.unshift(fn, name?)` | Add to beginning |
| `.before(target, fn, name?)` | Insert before named middleware |
| `.after(target, fn, name?)` | Insert after named middleware |
| `.remove(name)` | Remove by name |
| `.has(name)` | Check existence |
| `.list()` | List all entries |
| `.resolve(handler)` | Compose into a single function |
| `.clone()` | Independent copy |

## Custom middleware

Middleware follows the `(next) => async (config) => result` pattern:

```js
const timing = (next) => async (config) => {
  const start = Date.now();
  const result = await next(config);
  console.log(`${config.method} ${config.url} took ${Date.now() - start}ms`);
  return result;
};

api.getMiddleware().push(timing, 'timing');
```

## Validation rules

The validation middleware supports Laravel-style pipe-delimited string rules:

```js
await api.post('/users')
  .use(Middleware.validation({
    email:    'required|email',
    name:     'required|string|min:2|max:100',
    age:      'required|number|min:18|max:120',
    role:     'required|in:admin,user,moderator',
    website:  'url',
    bio:      'max:500',
  }))
  .withBody({ email: 'bad', name: 'A' })
  .send();
// Returns { status: 422, error: { errors: { email: [...], name: [...] } } }
```

Supported rules: `required`, `string`, `number`, `boolean`, `email`, `url`, `min:N`, `max:N`, `in:a,b,c`, and custom `(value) => bool` functions.

---

[← Docs index](../../README.md#documentation)
