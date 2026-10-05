# Request cancellation

Cancel an in-flight request with an `AbortController`. Reference: [API reference](../tools/api-reference.md).

```js
const controller = api.get('/search').withParams({ q: query }).abortable();
controller.abort(); // cancel
```

---

[← Docs index](../../README.md#documentation)
