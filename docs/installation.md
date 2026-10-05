# Installation

What the client needs, how to load it, and how a Laravel application wires it up.

## Requirements

- **Axios** ≥ 0.21 (the only required dependency — must be loaded before this script)
- **Browser**: any modern browser (Chrome, Firefox, Safari, Edge)
- **Node.js**: ≥ 14 (for private class fields)
- **Framework**: none required — works with Laravel, Rails, Django, Express, Phoenix, or standalone
- **Optional**: Toastr / SweetAlert2 / Notyf / iziToast (if you prefer an external toast library over the built-in FluentToast)
- **Optional**: jQuery Validation Plugin + laravel-jsvalidation (for client-side validation)

## Loading the scripts

The client is plain files with no build step. Copy `assets/js/FluentHttpAjaxify.js` (and `assets/js/FluentToast.js` with `assets/css/fluent-toast.css` if you want the built-in toasts) into your public assets, load Axios first, then the client:

```html
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script src="/js/FluentToast.js"></script>
<script src="/js/FluentHttpAjaxify.js"></script>
```

The package is not published to npm yet. Laravel applications get these files from [`laranail/fluent-http-ajaxify-laravel`](https://github.com/laranail/fluent-http-ajaxify-laravel), which vendors them and publishes them with `vendor:publish`.

## Setup in Laravel

```js
// bootstrap.js — configure once
const api = new FluentHttpAjaxify({
  baseURL: '/api',
  token: localStorage.getItem('auth_token'),
  debug: true,
  concurrency: 4,
  history: 50,
});

api
  .useNotifier('auto')
  .autoNotify({ error: true, validation: 'Please fix the errors below' })
  .on('error:401', () => window.location = '/login')
  .onUnauthorized(async () => {
    const { data } = await api.post('/auth/refresh').send();
    if (data?.token) api.withToken(data.token);
    else window.location = '/login';
  });

window.api = api;
```

```js
// Anywhere in your app
const { data, error } = await api.post('/students')
  .withBody({ name: 'Imani', email: 'imani@unc.edu' })
  .notify({ success: 'Student created!', error: 'Failed to create student' })
  .send();
```

---

[← Docs index](../README.md#documentation)
