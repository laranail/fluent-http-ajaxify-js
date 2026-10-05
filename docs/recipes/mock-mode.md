# Mock mode

Intercept requests with a route map, for unit tests. Reference: [API reference](../tools/api-reference.md).

```js
api.mock({
  '/users':      [{ id: 1, name: 'Imani' }],
  'POST:/login': (params, body) => ({ token: 'test-123' }),
});
api.mock(null); // disable
```

---

[← Docs index](../../README.md#documentation)
