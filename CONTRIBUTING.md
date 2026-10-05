# Contributing to `laranail/fluent-http-ajaxify-js`

Where this file is silent, the [laranail contributing guide](https://github.com/laranail/.github/blob/HEAD/CONTRIBUTING.md) applies.

## Getting set up

```bash
npm install
npm test
```

`npm test` runs the Vitest suites (jsdom) and then `tests/security.test.js`, a standalone node
script with its own harness. Run it alone with `npm run test:security`.

No lock file is committed. This is a library, so a lock records a resolution consumers never use,
and it goes stale invisibly because CI resolves fresh.

## Conventions

- The client is one UMD file, `assets/js/FluentHttpAjaxify.js`, with no build step. Edit it
  directly; keep it loadable by `<script>`, CommonJS and AMD.
- The only runtime dependency is Axios, loaded by the host page. Do not add another.
- Keep the version in step in three places: `package.json`, `_REGISTRATION.metadata.version`, and
  the header of `FluentHttpAjaxify.d.ts`.
- When a public method changes, update `FluentHttpAjaxify.d.ts` and the matching page under
  `docs/tools/` in the same pull request.
- `archive/` holds a superseded copy kept for reference. Nothing loads it; do not edit it.

## Pull requests

Branch from `main`, keep the subject line under 72 characters and in the imperative, and explain
*why* in the body rather than restating the diff. Add a `CHANGELOG.md` entry under
`## [Unreleased]` for anything a consumer would notice.

The Laravel package [`laranail/fluent-http-ajaxify-laravel`](https://github.com/laranail/fluent-http-ajaxify-laravel)
vendors these files. After a change here is released, run its `bin/sync-client` against this
checkout.

## Reporting problems

Bugs and features: GitHub Issues. Vulnerabilities: see [SECURITY.md](SECURITY.md), never a public
issue.
