# Release

Version history, the migration notes between majors, and how a release reaches the Laravel package.

## Versioning

| Version | Date | Notes |
|---------|------|-------|
| 3.0.0 | 2026 | OWASP security hardening, ResponseProtocol, FluentHttpWrapper, Laravel package (`simtabi/fluent-http-laravel`), auto-binding (form/link/button), CSS framework detection, adapter validation, keyboard dismiss, 61 security tests |
| 2.2.0 | 2025 | Middleware pipeline (14 built-in), FluentToast extracted to standalone module, validation rules engine, convenience methods, debug enhancements (request ID, response size), 9 bug fixes, SCSS partials, Vitest test suite |
| 2.1.1 | March 2026 | 5 bug fixes: `send()` never-throws guarantee enforced, EventEmitter resilience, `withFiles()` body field preservation, `clone()` payload isolation, Node.js 18–19 compat. Docs: declarative form attributes table |
| 2.1.0 | June 2025 | Built-in FluentToast (zero-dep), FluentDebugger (5 log levels, grouped/color-coded), `dump()`, `inspect()`, 6 bug fixes, framework-agnostic |
| 2.0.0 | March 2025 | Smart auto-init, EventEmitter, NotificationAdapter, FormHandler, history, method override, clone, HEAD/OPTIONS |
| 1.0.0 | March 2025 | Full rewrite — UMD IIFE, 15 features, structured returns, full JSDoc + TypeScript |

## Cutting a release

The version is written in three places and they must agree: `package.json` `version`, `_REGISTRATION.metadata.version` in `assets/js/FluentHttpAjaxify.js`, and the header of `FluentHttpAjaxify.d.ts`.

1. Move the `## [Unreleased]` entries in `CHANGELOG.md` under the new version heading.
2. Run `npm test` (Vitest plus the standalone security script).
3. Merge through a pull request, then tag the merge commit.
4. In `laranail/fluent-http-ajaxify-laravel`, run `bin/sync-client` against this checkout so the Laravel package ships the new files with the source commit recorded in their header.

## Migration from v2.1.x → v2.2.0

1. **Toast notifications** are no longer embedded in the handler:
   - Add `<script src="FluentToast.js"></script>` after the handler, OR
   - Use `<script src="fluent-http-bundle.js"></script>` as a drop-in replacement
2. **FluentToast auto-bridges** to the global instance — no code changes needed if both scripts load
3. **Default notifier** is now `ConsoleNotifier` (console fallback) when FluentToast isn't loaded
4. `useNotifier()` still works — pass `FluentToast` object or any `{ success, error, warning, info }` adapter
5. **Middleware** is additive — all existing code continues to work without changes
6. **New SCSS partials** available for custom styling (optional)

---

[← Docs index](../README.md#documentation)
