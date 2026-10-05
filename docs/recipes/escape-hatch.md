# Escape hatch with `withOptions()`

Pass any raw Axios option the builder has no method for. Reference: [API reference](../tools/api-reference.md).

```js
const { data } = await api.get('/protected')
  .withOptions({ withCredentials: true, maxRedirects: 5 })
  .send();
```

---

[← Docs index](../../README.md#documentation)
