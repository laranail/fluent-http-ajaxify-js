# History, method override and clone

Three builder features: the request history log, `X-HTTP-Method-Override`, and `clone()`.

## History

```js
const api = new FluentHttpAjaxify({ baseURL: '/api', history: 100 });

// After some requests...
const log = api.getHistory();
// [{ method: 'GET', url: '/api/users', status: 200, duration: 45, timestamp: 1742... }, ...]

api.clearHistory();
```

## Method override

For servers or proxies that don't support PUT/PATCH/DELETE:

```js
await api.patch('/users/1')
  .withBody({ name: 'Updated' })
  .withMethodOverride()
  .send();
// Sends: POST /users/1
// Headers: X-HTTP-Method-Override: PATCH
// Body: { name: 'Updated', _method: 'PATCH' }
```

## Clone

```js
const base = api.get('/users').withParams({ active: true }).retry(3, 500);

const page1 = base.clone().withParam('page', 1).send();
const page2 = base.clone().withParam('page', 2).send();
```

---

[← Docs index](../../README.md#documentation)
