# Pagination

Walk every page of a paginated API with `.paginate()`. Reference: [API reference](../tools/api-reference.md).

```js
const { data: allUsers } = await api.get('/users')
  .paginate({ limit: 50, maxPages: 10 });
```

---

[← Docs index](../../README.md#documentation)
