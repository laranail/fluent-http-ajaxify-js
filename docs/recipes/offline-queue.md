# Offline queue

Queue requests while the browser is offline and send them on reconnect. Reference: [API reference](../tools/api-reference.md).

```js
const api = new FluentHttpAjaxify({ baseURL: '/api', offline: true });
api.on('offline:queued', ({ url }) => showBanner('Queued: ' + url));
```

---

[← Docs index](../../README.md#documentation)
