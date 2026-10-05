# Retry with exponential backoff

Retry a failed request with a growing delay; 4xx responses are not retried. Reference: [API reference](../tools/api-reference.md).

```js
const { data } = await api.get('/flaky-endpoint')
  .retry(3, 500, { exponential: true })
  .on('retry', ({ attempt, delay }) => console.log(`Retry ${attempt} in ${delay}ms`))
  .send();
```

---

[← Docs index](../../README.md#documentation)
