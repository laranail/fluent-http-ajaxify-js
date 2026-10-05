# File upload with progress

Upload a file as multipart form data and report upload progress. Reference: [API reference](../tools/api-reference.md).

```js
const { data } = await api.post('/upload')
  .withFile('avatar', fileInput.files[0])
  .onProgress(pct => progressBar.style.width = pct + '%')
  .notify({ success: 'Upload complete!' })
  .send();
```

---

[← Docs index](../../README.md#documentation)
