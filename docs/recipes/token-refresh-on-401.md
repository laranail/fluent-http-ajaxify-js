# Token refresh on 401

Refresh an expired token on a 401 and replay the request. Reference: [API reference](../tools/api-reference.md).

```js
api.onUnauthorized(async () => {
  const { data } = await api.post('/auth/refresh').send();
  if (data?.token) api.withToken(data.token);
  else window.location = '/login';
});
```

---

[← Docs index](../../README.md#documentation)
