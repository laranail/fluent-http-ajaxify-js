# Architecture

How the client is put together: one UMD file, a registration block of defaults, and optional companion modules.

## Why this exists

Every project that talks to a backend eventually grows a graveyard of repeated `axios.get(...)` calls — each one re-inventing headers, error handling, token injection, and response parsing.

**FluentHttpAjaxify** ends that. One configured instance. One consistent interface. One place to update.

## `_REGISTRATION` pattern

```js
const reg = FluentHttpAjaxify.getRegistration();
console.log(reg.metadata.version); // '3.0.0'
console.log(reg.config.smart);     // { autoInit: true, autoBindForms: true, ... }
```

```js
_REGISTRATION = {
  config: {
    http:     { baseURL, timeout, tokenScheme, defaultHeaders, csrf },
    features: { debug, offline, concurrency, history },
    smart:    { autoInit, autoBindForms, autoNotifier, globalName, metaPrefix }
  },
  metadata: { name, version, type, description, authors, dependencies, tags, stable },
  messages: { info: { ... }, error: { ... } }
}
```

## File structure

```
fluent-http-ajaxify-js/
├── assets/
│   ├── js/
│   │   ├── FluentHttpAjaxify.js   ← core HTTP client
│   │   ├── FluentToast.js             ← standalone toast module
│   │   ├── FluentHttpWrapper.js       ← high-level convenience patterns
│   │   └── fluent-http-bundle.js      ← backward-compat bundle loader
│   ├── css/
│   │   └── fluent-toast.css           ← pre-compiled toast styles
│   └── scss/
│       ├── fluent-toast.scss          ← main SCSS entry point
│       ├── _variables.scss            ← customizable variables
│       ├── _container.scss            ← position system
│       ├── _toast.scss                ← toast element styles
│       ├── _progress.scss             ← progress bar
│       ├── _colors.scss               ← light + dark themes
│       ├── _dark.scss                 ← class-based dark mode
│       ├── _bootstrap.scss            ← Bootstrap integration
│       ├── _tailwind.scss             ← Tailwind integration
│       └── _bulma.scss                ← Bulma integration
├── tests/
│   ├── setup.js
│   ├── helpers/
│   │   ├── mock-axios.js
│   │   └── loader.js
│   ├── security.test.js               ← standalone node script (61 checks)
│   ├── unit/
│   │   ├── form-handler.test.js
│   │   ├── response-protocol.test.js
│   │   ├── middleware-stack.test.js
│   │   ├── middleware-builtin.test.js
│   │   ├── console-notifier.test.js
│   │   ├── fluent-toast.test.js
│   │   ├── request-builder.test.js
│   │   └── handler-core.test.js
│   └── integration/
│       ├── middleware-pipeline.test.js
│       └── toast-bridge.test.js
├── archive/
│   └── FluentHttpAjaxify.root-copy.js ← superseded v2.1.1 copy, kept for reference
├── FluentHttpAjaxify.d.ts         ← TypeScript definitions
├── package.json
├── vitest.config.js
├── CHANGELOG.md
└── README.md
```

The Laravel integration that used to sit in a `fluent-http-laravel/` directory here is its own repository, [`laranail/fluent-http-ajaxify-laravel`](https://github.com/laranail/fluent-http-ajaxify-laravel). It vendors the files in `assets/` and records the commit they came from.

---

[← Docs index](../README.md#documentation)
