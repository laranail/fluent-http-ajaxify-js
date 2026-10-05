# Form binding

Submit forms over AJAX programmatically or with `data-fluent-*` attributes, and show 422 errors on the inputs.

## Programmatic

```js
api.bindForm('#my-form', {
  action: '/api/users',
  method: 'POST',
  resetOnSuccess: true,
  successMessage: 'User created!',
  errorClass: 'is-invalid',         // CSS class for invalid fields
  errorTag: '.invalid-feedback',    // selector for error message element
  confirm: 'Are you sure?',         // SweetAlert2 or window.confirm
  onSuccess: (data) => refreshTable(data),
  onError: (err) => console.error(err),
});
```

## Declarative (data attributes)

```html
<form data-fluent-action="/api/users"
      data-fluent-method="POST"
      data-fluent-reset="true"
      data-fluent-success="User created!"
      data-fluent-confirm="Are you sure?"
      data-fluent-error-class="is-invalid"
      data-fluent-error-tag=".invalid-feedback">
  <input name="name" required>
  <div class="invalid-feedback"></div>
  <input name="email" type="email" required>
  <div class="invalid-feedback"></div>
  <button type="submit">Create</button>
</form>
```

### Supported `data-fluent-*` attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-fluent-action` | — | **(required)** Form action URL |
| `data-fluent-method` | `'POST'` | HTTP method |
| `data-fluent-reset` | `'false'` | Reset form after success (`'true'`/`'false'`) |
| `data-fluent-success` | — | Toast message on success |
| `data-fluent-confirm` | — | Confirm dialog before submit (SweetAlert2 or `window.confirm`) |
| `data-fluent-error-class` | `'is-invalid'` | CSS class applied to invalid fields on 422 |
| `data-fluent-error-tag` | `'.invalid-feedback'` | Selector for error message element next to invalid fields |

Forms with `data-fluent-action` are **auto-bound** when `<meta name="api-base-url">` is present. No JavaScript needed.

## 422 validation error display

When the server returns a 422 with the standard JSON validation format `{ errors: { field: ['msg'] } }` (used by Laravel, AdonisJS, NestJS, and many REST APIs):
- The corresponding input gets the `is-invalid` class
- The `.invalid-feedback` sibling element shows the first error message
- Errors clear automatically when the user types in the field
- Supports dot-notation fields (`address.city` → `address[city]`)

## Optional: laravel-jsvalidation

If `proengsoft/laravel-jsvalidation` is loaded (jQuery Validation Plugin), FluentHttpAjaxify runs client-side validation **before** sending the AJAX request. This is an optional enhancement — not a dependency.

---

[← Docs index](../../README.md#documentation)
