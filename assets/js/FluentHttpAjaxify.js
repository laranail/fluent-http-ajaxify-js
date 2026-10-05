/**
 * FluentHttpAjaxify v3.0.0
 * ────────────────────────────────────────────────────────────────────────────
 * A fluent, chainable, zero-repetition HTTP client built on Axios.
 * Framework-agnostic. Plug-and-play — no bundler needed.
 *
 * UMD module: works via <script> tag, ESM import, or CommonJS require().
 * Requires Axios to be loaded before this script.
 *
 * @license MIT
 * @see https://github.com/axios/axios
 *
 * @example
 *   // Browser: <script src="axios.min.js"></script><script src="FluentHttpAjaxify.js"></script>
 *   const api = FluentHttpAjaxify.create('https://myapp.test/api');
 *
 *   // GET — structured return, never throws
 *   const { data, error, status } = await api.get('/users').send();
 *
 *   // POST with body
 *   const result = await api.post('/users').withBody({ name: 'Imani' }).withToken(token).send();
 *
 *   // Chainable callbacks
 *   await api.get('/users')
 *     .onSuccess(data => console.log(data))
 *     .onError(err  => console.error(err))
 *     .send();
 */
(function (root, factory) {
  /* istanbul ignore next */
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FluentHttpAjaxify = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Global root reference ─────────────────────────────────────────────────
  // The UMD wrapper's `root` parameter is NOT in scope here (different closure).
  // We must resolve the global object ourselves inside the factory.
  var root = (typeof self !== 'undefined') ? self
           : (typeof globalThis !== 'undefined') ? globalThis
           : (typeof global !== 'undefined') ? global
           : {};

  // ── Axios dependency check ───────────────────────────────────────────────
  var axios = (typeof root.axios !== 'undefined') ? root.axios
            : (typeof require === 'function') ? (function () { try { return require('axios'); } catch (_) { return null; } })()
            : null;
  if (!axios) {
    console.error('[FluentHttp] axios is required but was not found. Load axios before FluentHttpAjaxify.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Registration (Framework Pattern)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Module registration block.
   * Contains config defaults, metadata, and message templates.
   * Config values serve as fallbacks when no user config is provided.
   *
   * @private
   * @type {Object}
   */
  var _REGISTRATION = {

    config: {
      http: {
        baseURL:        '',
        timeout:        10000,
        tokenScheme:    'Bearer',
        defaultHeaders: {},
        csrf:           null,
        csrfHeaderName: 'X-CSRF-TOKEN',
        csrfCookieName: null
      },
      features: {
        debug:       false,
        offline:     false,
        concurrency: 0,
        history:     0
      },
      security: {
        requireHttps:       false,
        allowedOrigins:     null,
        maxRequestBodySize: 10 * 1024 * 1024,
        maxResponseSize:    50 * 1024 * 1024,
        sectionSanitize:    'basic',
        allowServerEval:    false,
        sensitiveHeaders:   null
      },
      protocol: {
        enabled:       false,
        autoRedirect:  true,
        autoFlash:     true,
        autoSections:  true,
        autoScrollTo:  true,
        autoDump:      true
      },
      smart: {
        autoInit:      true,
        autoBindForms: true,
        autoNotifier:  true,
        globalName:    'FluentHttp',
        metaPrefix:    ''
      }
    },

    metadata: {
      name:         'FluentHttpAjaxify',
      version:      '3.0.0',
      type:         'instance',
      description:  'Fluent, chainable, zero-repetition HTTP client built on Axios',
      authors:      [
        { name: 'Imani Manyara' }
      ],
      dependencies: ['axios'],
      tags:         ['http', 'ajax', 'axios', 'fluent', 'chainable', 'rest', 'laravel'],
      stable:       true
    },

    messages: {
      info: {
        requestSent:     '[FluentHttpAjaxify] %s %s \u2192 %d (%dms)',
        requestError:    '[FluentHttpAjaxify] %s %s \u2192 ERROR %d (%dms) %s',
        cacheHit:        '[FluentHttpAjaxify] Cache hit: %s',
        offlineQueued:   '[FluentHttpAjaxify] Offline \u2014 request queued',
        mockIntercepted: '[FluentHttpAjaxify] Mock intercepted: %s %s',
        autoInit:        '[FluentHttpAjaxify] Auto-initialized from <meta> tags',
        formBound:       '[FluentHttpAjaxify] Form bound: %s',
        notifierSet:     '[FluentHttpAjaxify] Notifier set: %s'
      },
      error: {
        alreadySent:  'Request already sent. Create a new request builder.',
        networkError: 'Network error \u2014 no response received',
        configError:  'Request configuration error'
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Internal Helpers (hidden by IIFE — not exported)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * In-memory cache with per-entry TTL.
   * @private
   */
  class CacheStore {
    /** @type {Map<string, { value: *, expiresAt: number }>} */
    #entries = new Map();

    /**
     * @param {string} key
     * @returns {*|undefined}
     */
    get(key) {
      var entry = this.#entries.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        this.#entries.delete(key);
        return undefined;
      }
      return entry.value;
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {number} ttlMs
     */
    set(key, value, ttlMs) {
      this.#entries.set(key, { value: value, expiresAt: Date.now() + ttlMs });
    }

    clear() {
      this.#entries.clear();
    }

    /**
     * @param {string} key
     */
    delete(key) {
      this.#entries.delete(key);
    }
  }

  /**
   * Tracks in-flight requests for deduplication.
   * When an identical GET is already in-flight, the second caller joins the
   * existing promise instead of firing a duplicate network call.
   * @private
   */
  class DedupStore {
    /** @type {Map<string, Promise>} */
    #inflight = new Map();

    /**
     * @param {string} key
     * @returns {Promise|undefined}
     */
    get(key) {
      return this.#inflight.get(key);
    }

    /**
     * @param {string} key
     * @param {Promise} promise
     */
    set(key, promise) {
      this.#inflight.set(key, promise);
      promise.finally(function () { this.#inflight.delete(key); }.bind(this));
    }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      return this.#inflight.has(key);
    }
  }

  /**
   * Semaphore-based concurrency limiter.
   * Queues requests when the limit is reached and releases slots on completion.
   * @private
   */
  class ConcurrencyQueue {
    #max;
    #running = 0;
    /** @type {Array<function>} */
    #queue = [];

    /** @param {number} max */
    constructor(max) {
      this.#max = max;
    }

    /** @returns {Promise<void>} */
    async acquire() {
      if (this.#running < this.#max) {
        this.#running++;
        return;
      }
      return new Promise(function (resolve) {
        this.#queue.push(resolve);
      }.bind(this));
    }

    release() {
      this.#running--;
      if (this.#queue.length > 0) {
        this.#running++;
        var next = this.#queue.shift();
        next();
      }
    }
  }

  /**
   * Queues requests made while the browser is offline and flushes them
   * automatically when connectivity is restored.
   * @private
   */
  class OfflineQueue {
    /** @type {Array<function>} */
    #queue = [];
    #listening = false;

    /** @param {function} fn */
    enqueue(fn) {
      this.#queue.push(fn);
      this.#startListening();
    }

    /** @private */
    #startListening() {
      if (this.#listening || typeof window === 'undefined') return;
      this.#listening = true;
      var self = this;
      window.addEventListener('online', function onOnline() {
        window.removeEventListener('online', onOnline);
        self.#flush();
      });
    }

    /** @private */
    #flush() {
      this.#listening = false;
      var pending = this.#queue.splice(0);
      for (var i = 0; i < pending.length; i++) {
        try {
          pending[i]();
        } catch (err) {
          console.error('[FluentHttp] OfflineQueue flush error:', err);
        }
      }
    }

    /** @returns {number} */
    get length() {
      return this.#queue.length;
    }
  }

  /**
   * Generates a deterministic key from request config for caching / dedup.
   * @param {string} method
   * @param {string} url
   * @param {Object} [params]
   * @returns {string}
   * @private
   */
  function requestKey(method, url, params) {
    var paramStr;
    try {
      paramStr = JSON.stringify(params || {});
    } catch (_) {
      paramStr = '';
    }
    return method + ':' + url + '?' + paramStr;
  }

  /**
   * Returns a promise that resolves after `ms` milliseconds.
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * @returns {boolean} True if running in a browser environment.
   * @private
   */
  function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * @returns {boolean} True if the browser is online (always true in Node.js).
   * @private
   */
  function isOnline() {
    if (!isBrowser()) return true;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Auto-detect CSRF token from multiple `<meta>` tag conventions.
   * Checks (in order): prefixed `csrf-token`, `_token` (laravel-ajax style),
   * unprefixed `csrf-token` (Laravel 5.4+), and `XSRF-TOKEN` cookie.
   * Returns empty string in non-browser environments or if no token is found.
   *
   * @param {string} [prefix='']
   * @returns {string}
   * @private
   */
  function detectCsrf(prefix) {
    if (!isBrowser()) return '';
    var pfx = prefix || '';
    // 1. Prefixed csrf-token meta
    var el = document.querySelector('meta[name="' + pfx + 'csrf-token"]');
    if (el && el.getAttribute('content')) return el.getAttribute('content');
    // 2. _token meta (laravel-ajax convention)
    el = document.querySelector('meta[name="' + pfx + '_token"]');
    if (el && el.getAttribute('content')) return el.getAttribute('content');
    // 3. Unprefixed csrf-token (if prefix was used and didn't match)
    if (pfx) {
      el = document.querySelector('meta[name="csrf-token"]');
      if (el && el.getAttribute('content')) return el.getAttribute('content');
    }
    // 4. XSRF-TOKEN cookie (Laravel's encrypted cookie pattern)
    return readCsrfCookie('XSRF-TOKEN');
  }

  /**
   * Read a cookie value by name (for CSRF double-submit cookie pattern).
   * Returns empty string if cookie not found or in non-browser environment.
   *
   * @param {string} name
   * @returns {string}
   * @private
   */
  function readCsrfCookie(name) {
    if (!isBrowser() || typeof document.cookie !== 'string') return '';
    var match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  // ── Security Utilities ──────────────────────────────────────────────────

  /**
   * Dangerous property keys that must be filtered to prevent prototype pollution.
   * @private
   */
  var POISON_KEYS = ['__proto__', 'constructor', 'prototype'];

  /**
   * Sanitize a string for safe HTML insertion.
   * Shared utility available to both handler and toast.
   * @param {string} str
   * @returns {string}
   * @private
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Safe version of Object.assign that filters out prototype pollution keys.
   * Prevents `__proto__`, `constructor`, and `prototype` from being copied.
   *
   * @param {Object} target
   * @param {...Object} sources
   * @returns {Object}
   * @private
   */
  function safeAssign(target) {
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    var to = Object(target);
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      if (source == null) continue;
      var keys = Object.keys(source);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (POISON_KEYS.indexOf(key) !== -1) continue;
        to[key] = source[key];
      }
    }
    return to;
  }

  /**
   * Validate a URL string against dangerous schemes (XSS vectors).
   * Returns the URL unchanged if safe, or throws if dangerous.
   *
   * @param {string} url
   * @returns {string}
   * @throws {Error} If URL contains a dangerous scheme
   * @private
   */
  function sanitizeUrl(url) {
    if (typeof url !== 'string') return '';
    var trimmed = url.trim();
    // Block dangerous schemes
    var lower = trimmed.toLowerCase();
    if (/^(javascript|data|vbscript)\s*:/i.test(lower)) {
      throw new Error('[FluentHttp] Blocked dangerous URL scheme: ' + trimmed.substring(0, 30));
    }
    // Block control characters (CRLF injection in URLs)
    if (/[\x00-\x1f\x7f]/.test(trimmed)) {
      throw new Error('[FluentHttp] URL contains control characters');
    }
    // Block HTML-significant characters that enable injection
    if (/[<>"'`]/.test(trimmed)) {
      throw new Error('[FluentHttp] URL contains unsafe characters');
    }
    return trimmed;
  }

  /**
   * Sanitize HTML for safe DOM insertion (section redraws).
   * If DOMPurify is available, delegates to it. Otherwise uses a built-in
   * sanitizer that strips `<script>`, event handler attributes (`on*=`),
   * and `javascript:` URLs.
   *
   * @param {string} html
   * @param {string} [mode='basic']  'strict' | 'basic' | 'none'
   * @returns {string}
   * @private
   */
  function sanitizeHtml(html, mode) {
    if (typeof html !== 'string') return '';
    if (mode === 'none') return html;

    // Prefer DOMPurify if available
    if (typeof root.DOMPurify !== 'undefined' && typeof root.DOMPurify.sanitize === 'function') {
      return root.DOMPurify.sanitize(html, mode === 'strict' ? { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th'] } : {});
    }

    // Built-in fallback sanitizer
    var sanitized = html;
    // Remove <script> tags and contents
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Remove event handler attributes (on*=)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
    // Remove javascript: URLs in href/src/action attributes
    sanitized = sanitized.replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1=""');
    // Remove data: URLs (potential XSS vector) in src attributes
    sanitized = sanitized.replace(/src\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, 'src=""');

    if (mode === 'strict') {
      // Also remove <style>, <iframe>, <object>, <embed>, <form>
      sanitized = sanitized.replace(/<(style|iframe|object|embed|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');
      sanitized = sanitized.replace(/<(style|iframe|object|embed|form)\b[^>]*\/?>/gi, '');
    }

    return sanitized;
  }

  /**
   * Validate a header value against CRLF injection.
   * Throws if the value contains carriage return or line feed characters.
   *
   * @param {string} key
   * @param {string} value
   * @returns {string}
   * @throws {Error} If value contains CRLF characters
   * @private
   */
  function validateHeaderValue(key, value) {
    if (typeof value !== 'string') return value;
    if (/[\r\n]/.test(value)) {
      throw new Error('[FluentHttp] Header "' + key + '" contains CRLF characters (possible injection)');
    }
    return value;
  }

  /**
   * Check if a payload exceeds the configured max size.
   *
   * @param {*} payload
   * @param {number} maxBytes
   * @returns {boolean}
   * @private
   */
  function exceedsBodySize(payload, maxBytes) {
    if (!maxBytes || maxBytes <= 0) return false;
    if (typeof FormData !== 'undefined' && payload instanceof FormData) return false; // Can't easily measure FormData
    try {
      var str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return str && str.length > maxBytes;
    } catch (_) {
      return false;
    }
  }

  /**
   * Convert dot-notation field name to bracket notation.
   * e.g. `offices.0.id` → `offices[0][id]`
   *
   * @param {string} name
   * @returns {string}
   * @private
   */
  function sanitizeFieldName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/\.(\w+)/g, '[$1]');
  }

  /**
   * Extract the first error message from any response shape.
   * Supports: protocol `{ message }`, validation `{ errors: { field: ['msg'] } }`,
   * generic `{ error: 'msg' }`, or plain string.
   *
   * @param {*} response  The error response or data
   * @returns {string|null}
   * @private
   */
  function extractSingleError(response) {
    if (!response) return null;
    if (typeof response === 'string') return response;
    // Protocol message
    if (typeof response.message === 'string' && response.message) return response.message;
    // Validation errors — first message from first field
    if (response.errors && typeof response.errors === 'object') {
      var keys = Object.keys(response.errors);
      for (var i = 0; i < keys.length; i++) {
        var msgs = response.errors[keys[i]];
        if (Array.isArray(msgs) && msgs.length > 0) return msgs[0];
        if (typeof msgs === 'string') return msgs;
      }
    }
    // Generic error key
    if (typeof response.error === 'string') return response.error;
    return null;
  }

  /**
   * Detect the CSS framework in use for form validation error display.
   * Returns a config object with errorClass, messageClass, and messageTag.
   *
   * @param {string} [configured='auto']  'auto' | 'bootstrap3' | 'bootstrap4' | 'bootstrap5' | 'tailwind' | 'bulma' | 'custom'
   * @returns {{ errorClass: string, messageClass: string, messageTag: string, parentClass: string }}
   * @private
   */
  function detectCssFramework(configured) {
    if (configured && configured !== 'auto') {
      switch (configured) {
        case 'bootstrap3': return { errorClass: 'has-error', messageClass: 'help-block', messageTag: 'span', parentClass: 'form-group' };
        case 'bootstrap4': // fallthrough
        case 'bootstrap5': return { errorClass: 'is-invalid', messageClass: 'invalid-feedback', messageTag: 'div', parentClass: '' };
        case 'tailwind':   return { errorClass: 'border-red-500', messageClass: 'text-red-600 text-sm', messageTag: 'p', parentClass: '' };
        case 'bulma':      return { errorClass: 'is-danger', messageClass: 'help is-danger', messageTag: 'p', parentClass: 'field' };
        default:           return { errorClass: 'is-invalid', messageClass: 'invalid-feedback', messageTag: 'div', parentClass: '' };
      }
    }
    // Auto-detect
    if (!isBrowser()) return { errorClass: 'is-invalid', messageClass: 'invalid-feedback', messageTag: 'div', parentClass: '' };
    // Check for Bootstrap 3
    if (document.querySelector('.form-group') && document.querySelector('link[href*="bootstrap"][href*="3"]')) {
      return { errorClass: 'has-error', messageClass: 'help-block', messageTag: 'span', parentClass: 'form-group' };
    }
    // Check for Bulma
    if (document.querySelector('link[href*="bulma"]') || document.querySelector('.bulma') || document.querySelector('.field .control')) {
      return { errorClass: 'is-danger', messageClass: 'help is-danger', messageTag: 'p', parentClass: 'field' };
    }
    // Check for Tailwind (no easy detection — fall through)
    // Default: Bootstrap 4/5
    return { errorClass: 'is-invalid', messageClass: 'invalid-feedback', messageTag: 'div', parentClass: '' };
  }

  /**
   * Sensitive header names that must always be masked in debug output.
   * @private
   */
  var SENSITIVE_HEADERS = ['authorization', 'x-csrf-token', 'x-xsrf-token', 'cookie', 'set-cookie', 'x-api-key', 'api-key'];

  // ── DOM-Ready Helpers ────────────────────────────────────────────────────

  /**
   * Run `fn` as soon as the DOM is parsed (`DOMContentLoaded`).
   * If the DOM is already ready, `fn` executes synchronously.
   * No-op in non-browser environments.
   *
   * @param {function} fn
   * @private
   */
  function domReady(fn) {
    if (!isBrowser()) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /**
   * Run `fn` after `window.load` (all resources including images/styles).
   * If the window is already fully loaded, `fn` executes synchronously.
   * No-op in non-browser environments.
   *
   * @param {function} fn
   * @private
   */
  function windowReady(fn) {
    if (!isBrowser()) return;
    if (document.readyState === 'complete') {
      fn();
    } else {
      window.addEventListener('load', fn, { once: true });
    }
  }

  /**
   * Read a `<meta>` tag's `content` attribute by name.
   * Supports an optional prefix (e.g. `readMeta('base-url', 'app-')` reads `<meta name="app-base-url">`).
   *
   * @param {string} name
   * @param {string} [prefix='']
   * @returns {string|null}
   * @private
   */
  function readMeta(name, prefix) {
    if (!isBrowser()) return null;
    var fullName = (prefix || '') + name;
    var el = document.querySelector('meta[name="' + fullName + '"]');
    return el ? (el.getAttribute('content') || null) : null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EventEmitter
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Lightweight event emitter supporting `on`, `off`, `once`, and `emit`.
   * Used by both FluentHttpAjaxify and RequestBuilder for event-driven
   * hooks (success, error, error:422, start, complete, etc.).
   *
   * @private
   */
  class EventEmitter {
    /** @type {Map<string, Array<{ fn: function, once: boolean }>>} */
    #listeners = new Map();

    /**
     * Register a listener for an event.
     *
     * @param {string} event
     * @param {function} fn
     * @returns {this}
     */
    on(event, fn) {
      if (typeof fn !== 'function') return this;
      if (!this.#listeners.has(event)) this.#listeners.set(event, []);
      this.#listeners.get(event).push({ fn: fn, once: false });
      return this;
    }

    /**
     * Register a one-shot listener (auto-removed after first call).
     *
     * @param {string} event
     * @param {function} fn
     * @returns {this}
     */
    once(event, fn) {
      if (typeof fn !== 'function') return this;
      if (!this.#listeners.has(event)) this.#listeners.set(event, []);
      this.#listeners.get(event).push({ fn: fn, once: true });
      return this;
    }

    /**
     * Remove a specific listener. If `fn` is omitted, removes ALL listeners for the event.
     *
     * @param {string} event
     * @param {function} [fn]
     * @returns {this}
     */
    off(event, fn) {
      if (!fn) {
        this.#listeners.delete(event);
        return this;
      }
      var list = this.#listeners.get(event);
      if (!list) return this;
      this.#listeners.set(event, list.filter(function (l) { return l.fn !== fn; }));
      return this;
    }

    /**
     * Emit an event, calling all registered listeners with the given payload.
     *
     * @param {string} event
     * @param {*} [payload]
     * @returns {this}
     */
    emit(event, payload) {
      var list = this.#listeners.get(event);
      if (!list || list.length === 0) return this;
      var keep = [];
      for (var i = 0; i < list.length; i++) {
        try {
          list[i].fn(payload);
        } catch (e) {
          // Prevent one listener from breaking the chain — log and continue
          console.error('[FluentHttp] Listener error on "' + event + '":', e);
        }
        if (!list[i].once) keep.push(list[i]);
      }
      this.#listeners.set(event, keep);
      return this;
    }

    /**
     * Check if an event has any listeners.
     *
     * @param {string} event
     * @returns {boolean}
     */
    hasListeners(event) {
      var list = this.#listeners.get(event);
      return !!(list && list.length > 0);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ConsoleNotifier — Lightweight default notification adapter
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Console-only notification adapter.
   * Ships as the default when FluentToast.js is not loaded.
   * Satisfies the `{ success, error, warning, info }` interface.
   *
   * For rich toast notifications, load `FluentToast.js` separately and call:
   *   FluentToast.bridge(api)  OR  api.useNotifier(FluentToast)
   *
   * @private
   */
  var ConsoleNotifier = {
    success: function (msg, title) { console.log('[SUCCESS]', title || '', msg); },
    error:   function (msg, title) { console.error('[ERROR]', title || '', msg); },
    warning: function (msg, title) { console.warn('[WARNING]', title || '', msg); },
    info:    function (msg, title) { console.info('[INFO]', title || '', msg); },
  };

  /**
   * Notification adapter resolver.
   * Accepts a custom adapter object or falls back to ConsoleNotifier.
   *
   * For full adapter support (toastr, sweetalert2, notyf, izitoast, builtin, auto),
   * load `FluentToast.js` and use `FluentToast.createAdapter(driver)`.
   *
   * @private
   */
  var NotificationAdapter = {
    create: function (driver) {
      // Custom object adapter — { success, error, warning, info }
      if (driver && typeof driver === 'object' && typeof driver.success === 'function') {
        return driver;
      }
      // If FluentToast is loaded globally, delegate to its richer adapter factory
      if (typeof root.FluentToast !== 'undefined' && typeof root.FluentToast.createAdapter === 'function') {
        return root.FluentToast.createAdapter(driver);
      }
      // Fallback: console-only
      return ConsoleNotifier;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MiddlewareStack — Guzzle-style composable request/response pipeline
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Composable middleware pipeline inspired by Guzzle's HandlerStack.
   *
   * Middleware signature:  `function (next) → async function (config) → result`
   * Each middleware receives a `next` handler and returns a new handler.
   * The stack composes all middleware around a core handler via `resolve()`.
   *
   * Execution order (like Guzzle):
   *  push'd middleware = outermost (runs first on request, last on response)
   *  unshift'd middleware = innermost (runs last on request, first on response)
   *
   * @example
   * var stack = new MiddlewareStack();
   * stack.push(function loggingMiddleware(next) {
   *   return async function (config) {
   *     console.log('Request:', config.method, config.url);
   *     var result = await next(config);
   *     console.log('Response:', result.status);
   *     return result;
   *   };
   * }, 'logging');
   */
  class MiddlewareStack {
    /** @type {Array<{ fn: function, name: string|null }>} */
    #stack = [];

    /**
     * Add middleware to the end of the stack (outermost).
     * @param {function} middleware  `(next) → async (config) → result`
     * @param {string} [name]       Optional name for targeting with before/after/remove
     * @returns {this}
     */
    push(middleware, name) {
      if (typeof middleware !== 'function') throw new TypeError('[MiddlewareStack] middleware must be a function');
      if (name && this.has(name)) throw new Error('[MiddlewareStack] duplicate middleware name: ' + name);
      this.#stack.push({ fn: middleware, name: name || null });
      return this;
    }

    /**
     * Add middleware to the beginning of the stack (innermost).
     * @param {function} middleware
     * @param {string} [name]
     * @returns {this}
     */
    unshift(middleware, name) {
      if (typeof middleware !== 'function') throw new TypeError('[MiddlewareStack] middleware must be a function');
      if (name && this.has(name)) throw new Error('[MiddlewareStack] duplicate middleware name: ' + name);
      this.#stack.unshift({ fn: middleware, name: name || null });
      return this;
    }

    /**
     * Insert middleware before a named middleware.
     * @param {string} existingName
     * @param {function} middleware
     * @param {string} [name]
     * @returns {this}
     */
    before(existingName, middleware, name) {
      if (typeof middleware !== 'function') throw new TypeError('[MiddlewareStack] middleware must be a function');
      if (name && this.has(name)) throw new Error('[MiddlewareStack] duplicate middleware name: ' + name);
      var idx = this.#findIndex(existingName);
      if (idx === -1) throw new Error('[MiddlewareStack] middleware not found: ' + existingName);
      this.#stack.splice(idx, 0, { fn: middleware, name: name || null });
      return this;
    }

    /**
     * Insert middleware after a named middleware.
     * @param {string} existingName
     * @param {function} middleware
     * @param {string} [name]
     * @returns {this}
     */
    after(existingName, middleware, name) {
      if (typeof middleware !== 'function') throw new TypeError('[MiddlewareStack] middleware must be a function');
      if (name && this.has(name)) throw new Error('[MiddlewareStack] duplicate middleware name: ' + name);
      var idx = this.#findIndex(existingName);
      if (idx === -1) throw new Error('[MiddlewareStack] middleware not found: ' + existingName);
      this.#stack.splice(idx + 1, 0, { fn: middleware, name: name || null });
      return this;
    }

    /**
     * Remove a named middleware.
     * @param {string} name
     * @returns {this}
     */
    remove(name) {
      var idx = this.#findIndex(name);
      if (idx !== -1) this.#stack.splice(idx, 1);
      return this;
    }

    /**
     * Check if a named middleware exists.
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
      return this.#findIndex(name) !== -1;
    }

    /**
     * Compose all middleware around a core handler, returning a single handler function.
     *
     * The composition wraps from the END of the stack inward:
     *   stack[last] wraps stack[last-1] wraps ... wraps stack[0] wraps handler
     * This means stack[last] is outermost (first on request, last on response).
     *
     * @param {function} handler  The innermost handler: `async (config) → result`
     * @returns {function}        Composed handler: `async (config) → result`
     */
    resolve(handler) {
      var composed = handler;
      for (var i = 0; i < this.#stack.length; i++) {
        composed = this.#stack[i].fn(composed);
      }
      return composed;
    }

    /**
     * Get a debug-friendly list of middleware entries.
     * @returns {Array<{ name: string|null, fn: function }>}
     */
    list() {
      return this.#stack.map(function (entry) { return { name: entry.name, fn: entry.fn }; });
    }

    /**
     * Get the number of middleware in the stack.
     * @returns {number}
     */
    get length() {
      return this.#stack.length;
    }

    /**
     * Create a shallow clone of this stack.
     * @returns {MiddlewareStack}
     */
    clone() {
      var copy = new MiddlewareStack();
      for (var i = 0; i < this.#stack.length; i++) {
        copy.#stack.push({ fn: this.#stack[i].fn, name: this.#stack[i].name });
      }
      return copy;
    }

    /** @private */
    #findIndex(name) {
      for (var i = 0; i < this.#stack.length; i++) {
        if (this.#stack[i].name === name) return i;
      }
      return -1;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Middleware — Built-in middleware factories (14 total)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Collection of built-in, reusable middleware factories.
   * Each factory returns a middleware function compatible with MiddlewareStack.
   *
   * @example
   * api.middleware.push(Middleware.logging(), 'logging');
   * api.middleware.push(Middleware.retry({ attempts: 3 }), 'retry');
   * api.post('/users').use(Middleware.validation({ name: 'required' })).send();
   */
  var Middleware = {

    // ── 1. Validation ─────────────────────────────────────────────────────

    /**
     * Validate request payload before sending.
     * Supports Laravel-style string rules and custom functions.
     *
     * @param {Object} rules          `{ field: 'required|email|min:3' }` or `{ field: fn }`
     * @param {Object} [opts]
     * @param {string} [opts.message='Validation failed']
     * @returns {function} middleware
     */
    validation: function (rules, opts) {
      var options = opts || {};
      var message = options.message || 'Validation failed';

      return function validationMiddleware(next) {
        return async function (config) {
          var body = config.data;
          if (!body || typeof body !== 'object' || body instanceof FormData) {
            return next(config);
          }

          var errors = {};
          var ruleKeys = Object.keys(rules);
          for (var i = 0; i < ruleKeys.length; i++) {
            var field = ruleKeys[i];
            var value = body[field];
            var rule = rules[field];
            var fieldErrors = [];

            if (typeof rule === 'function') {
              var valid = rule(value, body);
              if (!valid) fieldErrors.push(field + ' is invalid');
            } else if (typeof rule === 'string') {
              fieldErrors = Middleware._validateField(field, value, rule);
            }

            if (fieldErrors.length > 0) errors[field] = fieldErrors;
          }

          if (Object.keys(errors).length > 0) {
            return {
              data: null,
              error: { status: 422, message: message, errors: errors, raw: null },
              status: 422,
            };
          }

          return next(config);
        };
      };
    },

    /**
     * Parse and validate a field against a pipe-delimited rule string.
     * @param {string} field
     * @param {*} value
     * @param {string} ruleStr  e.g. 'required|email|min:3'
     * @returns {string[]} errors
     * @private
     */
    _validateField: function (field, value, ruleStr) {
      var parts = ruleStr.split('|');
      var errors = [];
      var isRequired = parts.indexOf('required') !== -1;

      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (!part) continue;

        var colonIdx = part.indexOf(':');
        var ruleName = colonIdx > -1 ? part.substring(0, colonIdx) : part;
        var ruleArg = colonIdx > -1 ? part.substring(colonIdx + 1) : null;

        // Skip validation if value is empty and not required
        var isEmpty = value === undefined || value === null || value === '';
        if (isEmpty && !isRequired && ruleName !== 'required') continue;

        switch (ruleName) {
          case 'required':
            if (isEmpty) errors.push(field + ' is required');
            break;
          case 'string':
            if (!isEmpty && typeof value !== 'string') errors.push(field + ' must be a string');
            break;
          case 'number':
            if (!isEmpty && (typeof value !== 'number' || isNaN(value))) errors.push(field + ' must be a number');
            break;
          case 'integer':
            if (!isEmpty && (!Number.isInteger(value))) errors.push(field + ' must be an integer');
            break;
          case 'boolean':
            if (!isEmpty && typeof value !== 'boolean') errors.push(field + ' must be a boolean');
            break;
          case 'email':
            if (!isEmpty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push(field + ' must be a valid email');
            break;
          case 'url':
            if (!isEmpty) { try { new URL(String(value)); } catch (_) { errors.push(field + ' must be a valid URL'); } }
            break;
          case 'min':
            if (!isEmpty && ruleArg) {
              var minVal = parseFloat(ruleArg);
              if (typeof value === 'number' && value < minVal) errors.push(field + ' must be at least ' + minVal);
              else if (typeof value === 'string' && value.length < minVal) errors.push(field + ' must be at least ' + minVal + ' characters');
            }
            break;
          case 'max':
            if (!isEmpty && ruleArg) {
              var maxVal = parseFloat(ruleArg);
              if (typeof value === 'number' && value > maxVal) errors.push(field + ' must be at most ' + maxVal);
              else if (typeof value === 'string' && value.length > maxVal) errors.push(field + ' must be at most ' + maxVal + ' characters');
            }
            break;
          case 'minLength':
            if (!isEmpty && ruleArg && typeof value === 'string' && value.length < parseInt(ruleArg, 10)) {
              errors.push(field + ' must be at least ' + ruleArg + ' characters');
            }
            break;
          case 'maxLength':
            if (!isEmpty && ruleArg && typeof value === 'string' && value.length > parseInt(ruleArg, 10)) {
              errors.push(field + ' must be at most ' + ruleArg + ' characters');
            }
            break;
          case 'in':
            if (!isEmpty && ruleArg) {
              var allowed = ruleArg.split(',');
              if (allowed.indexOf(String(value)) === -1) errors.push(field + ' must be one of: ' + ruleArg);
            }
            break;
          case 'regex':
            if (!isEmpty && ruleArg) {
              var pattern = ruleArg.replace(/^\//, '').replace(/\/$/, '');
              if (!new RegExp(pattern).test(String(value))) errors.push(field + ' format is invalid');
            }
            break;
          case 'array':
            if (!isEmpty && !Array.isArray(value)) errors.push(field + ' must be an array');
            break;
          case 'object':
            if (!isEmpty && (typeof value !== 'object' || value === null || Array.isArray(value))) {
              errors.push(field + ' must be an object');
            }
            break;
        }
      }
      return errors;
    },

    // ── 2. Retry ──────────────────────────────────────────────────────────

    /**
     * Retry failed requests with configurable backoff.
     *
     * @param {Object} [opts]
     * @param {number} [opts.attempts=3]
     * @param {number} [opts.delay=300]        Base delay in ms
     * @param {boolean} [opts.exponential=true] Exponential backoff
     * @param {function} [opts.retryOn]         `(error, attempt) → boolean` — return false to skip retry
     * @returns {function} middleware
     */
    retry: function (opts) {
      var options = opts || {};
      var attempts = options.attempts || 3;
      var baseDelay = options.delay || 300;
      var exponential = options.exponential !== false;
      var retryOn = options.retryOn || null;

      return function retryMiddleware(next) {
        return async function (config) {
          var lastResult;
          for (var attempt = 1; attempt <= attempts; attempt++) {
            lastResult = await next(config);

            // Success — return immediately
            if (!lastResult.error) return lastResult;

            // Don't retry 4xx (client errors) unless retryOn says so
            var status = lastResult.error.status || 0;
            if (status >= 400 && status < 500) {
              if (!retryOn || !retryOn(lastResult.error, attempt)) return lastResult;
            }

            // Check custom retryOn filter
            if (retryOn && !retryOn(lastResult.error, attempt)) return lastResult;

            // Last attempt — return the error
            if (attempt >= attempts) return lastResult;

            // Wait before retry
            var delay = exponential ? baseDelay * Math.pow(2, attempt - 1) : baseDelay;
            await new Promise(function (resolve) { setTimeout(resolve, delay); });
          }
          return lastResult;
        };
      };
    },

    // ── 3. Auth ───────────────────────────────────────────────────────────

    /**
     * Dynamic authorization header injection.
     *
     * @param {function} tokenFn  `() → string` — called per-request for fresh token
     * @param {string} [scheme='Bearer']
     * @returns {function} middleware
     */
    auth: function (tokenFn, scheme) {
      var authScheme = scheme || 'Bearer';
      return function authMiddleware(next) {
        return async function (config) {
          var token = typeof tokenFn === 'function' ? tokenFn() : tokenFn;
          if (token) {
            config.headers = config.headers || {};
            config.headers['Authorization'] = authScheme + ' ' + token;
          }
          return next(config);
        };
      };
    },

    // ── 4. Logging ────────────────────────────────────────────────────────

    /**
     * Log request/response lifecycle.
     *
     * @param {Object} [logger=console]  Object with `log`, `error` methods
     * @returns {function} middleware
     */
    logging: function (logger) {
      var log = logger || console;
      return function loggingMiddleware(next) {
        return async function (config) {
          var start = Date.now();
          log.log('[FluentHttp:middleware:logging] →', config.method, config.url);
          var result = await next(config);
          var duration = Date.now() - start;
          if (result.error) {
            log.error('[FluentHttp:middleware:logging] ←', config.method, config.url, result.status, duration + 'ms', result.error.message);
          } else {
            log.log('[FluentHttp:middleware:logging] ←', config.method, config.url, result.status, duration + 'ms');
          }
          return result;
        };
      };
    },

    // ── 5. Cache ──────────────────────────────────────────────────────────

    /**
     * In-memory GET cache with TTL.
     *
     * @param {Object} [opts]
     * @param {number} [opts.ttl=60000]   TTL in milliseconds
     * @param {Object} [opts.store]       Custom `{ get(key), set(key, val, ttl), clear() }` store
     * @returns {function} middleware
     */
    cache: function (opts) {
      var options = opts || {};
      var ttl = options.ttl || 60000;
      var store = options.store || new CacheStore();

      return function cacheMiddleware(next) {
        return async function (config) {
          if (config.method !== 'GET') return next(config);

          var key = requestKey(config.method, config.url, config.params);
          var cached = store.get(key);
          if (cached !== undefined) {
            return { data: cached.data, error: null, status: cached.status };
          }

          var result = await next(config);
          if (!result.error) {
            store.set(key, { data: result.data, status: result.status }, ttl);
          }
          return result;
        };
      };
    },

    // ── 6. Dedup ──────────────────────────────────────────────────────────

    /**
     * Deduplicate identical in-flight GET requests.
     *
     * @returns {function} middleware
     */
    dedup: function () {
      var inflight = new Map();
      return function dedupMiddleware(next) {
        return async function (config) {
          if (config.method !== 'GET') return next(config);

          var key = requestKey(config.method, config.url, config.params);
          if (inflight.has(key)) {
            return inflight.get(key);
          }

          var promise = next(config);
          inflight.set(key, promise);
          promise.finally(function () { inflight.delete(key); });
          return promise;
        };
      };
    },

    // ── 7. History ────────────────────────────────────────────────────────

    /**
     * Record request/response into a history array (like Guzzle's history middleware).
     *
     * @param {Array} container  Array to push history entries into
     * @returns {function} middleware
     */
    history: function (container) {
      if (!Array.isArray(container)) throw new TypeError('[Middleware.history] container must be an array');
      return function historyMiddleware(next) {
        return async function (config) {
          var start = Date.now();
          var result = await next(config);
          container.push({
            request:  { method: config.method, url: config.url, headers: config.headers, data: config.data },
            response: { status: result.status, data: result.data, error: result.error },
            options:  config,
            duration: Date.now() - start,
          });
          return result;
        };
      };
    },

    // ── 8. Mock ───────────────────────────────────────────────────────────

    /**
     * Mock handler — returns queued responses or uses a function handler.
     *
     * @param {Array|function} handler  Array of responses (FIFO) or `(config) → result` function
     * @returns {function} middleware
     */
    mock: function (handler) {
      var queue = Array.isArray(handler) ? handler.slice() : null;
      var fn = typeof handler === 'function' ? handler : null;

      return function mockMiddleware(next) {
        return async function (config) {
          if (fn) return fn(config);
          if (queue && queue.length > 0) {
            var response = queue.shift();
            if (response instanceof Error) {
              return { data: null, error: { status: 0, message: response.message, errors: {}, raw: response }, status: 0 };
            }
            return { data: response.data || response, error: null, status: response.status || 200 };
          }
          // Queue exhausted — fall through to real handler
          return next(config);
        };
      };
    },

    // ── 9. Map Request ────────────────────────────────────────────────────

    /**
     * Transform request config before sending.
     *
     * @param {function} fn  `(config) → config`
     * @returns {function} middleware
     */
    mapRequest: function (fn) {
      return function mapRequestMiddleware(next) {
        return async function (config) {
          var transformed = fn(config);
          return next(transformed || config);
        };
      };
    },

    // ── 10. Map Response ──────────────────────────────────────────────────

    /**
     * Transform the full result object after response.
     *
     * @param {function} fn  `(result) → result` where result is `{ data, error, status }`
     * @returns {function} middleware
     */
    mapResponse: function (fn) {
      return function mapResponseMiddleware(next) {
        return async function (config) {
          var result = await next(config);
          return fn(result) || result;
        };
      };
    },

    // ── 11. Rate Limit ────────────────────────────────────────────────────

    /**
     * Rate limiter — max N requests per time window.
     *
     * @param {Object} [opts]
     * @param {number} [opts.max=10]          Maximum requests per window
     * @param {number} [opts.windowMs=1000]   Window duration in ms
     * @returns {function} middleware
     */
    rateLimit: function (opts) {
      var options = opts || {};
      var max = options.max || 10;
      var windowMs = options.windowMs || 1000;
      var timestamps = [];

      return function rateLimitMiddleware(next) {
        return async function (config) {
          var now = Date.now();
          // Remove expired timestamps
          timestamps = timestamps.filter(function (t) { return now - t < windowMs; });

          if (timestamps.length >= max) {
            var waitMs = windowMs - (now - timestamps[0]);
            await new Promise(function (resolve) { setTimeout(resolve, waitMs); });
          }

          timestamps.push(Date.now());
          return next(config);
        };
      };
    },

    // ── 12. Guard ─────────────────────────────────────────────────────────

    /**
     * Conditional gate — blocks requests that don't pass the predicate.
     *
     * @param {function} fn  `(config) → boolean|string` — truthy to allow, falsy or string to block
     * @returns {function} middleware
     */
    guard: function (fn) {
      return function guardMiddleware(next) {
        return async function (config) {
          var allowed = fn(config);
          if (!allowed) {
            var msg = typeof allowed === 'string' ? allowed : 'Request blocked by guard';
            return { data: null, error: { status: -1, message: msg, errors: {}, raw: null }, status: -1 };
          }
          return next(config);
        };
      };
    },

    // ── 13. Timeout ───────────────────────────────────────────────────────

    /**
     * Per-middleware timeout override.
     *
     * @param {number} ms  Timeout in milliseconds
     * @returns {function} middleware
     */
    timeout: function (ms) {
      return function timeoutMiddleware(next) {
        return async function (config) {
          config.timeout = ms;
          return next(config);
        };
      };
    },

    // ── 14. Transform Error ───────────────────────────────────────────────

    /**
     * Transform error objects before they reach handlers.
     *
     * @param {function} fn  `(error) → error`
     * @returns {function} middleware
     */
    transformError: function (fn) {
      return function transformErrorMiddleware(next) {
        return async function (config) {
          var result = await next(config);
          if (result.error) {
            result.error = fn(result.error) || result.error;
          }
          return result;
        };
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // FluentDebugger — Smart console debug system
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Professional-grade console debugging with log levels, color-coded output,
   * grouped request lifecycles, token masking, and payload truncation.
   *
   * Log levels (cumulative):
   *   `'silent'` → `'error'` → `'warn'` → `'info'` → `'verbose'`
   *
   * @private
   */
  class FluentDebugger {
    /** @type {string} */
    #level = 'silent';

    static LEVELS = { silent: 0, error: 1, warn: 2, info: 3, verbose: 4 };

    static STYLES = {
      success: 'color:#10b981;font-weight:bold',
      error:   'color:#ef4444;font-weight:bold',
      warn:    'color:#f59e0b;font-weight:bold',
      info:    'color:#3b82f6;font-weight:bold',
      verbose: 'color:#6b7280',
      label:   'color:#8b5cf6;font-weight:bold',
      dim:     'color:#9ca3af',
    };

    static PREFIX = '[FluentHttp]';

    /**
     * @param {string} [level='silent']
     */
    constructor(level) {
      this.#level = (level && FluentDebugger.LEVELS[level] !== undefined) ? level : 'silent';
      this._totalRequests = 0;
      this._totalErrors   = 0;
      this._totalDuration = 0;
    }

    /** @returns {string} */
    getLevel() { return this.#level; }

    /** @param {string|boolean} level */
    setLevel(level) {
      if (level === true) this.#level = 'info';
      else if (level === false) this.#level = 'silent';
      else if (typeof level === 'string' && FluentDebugger.LEVELS[level] !== undefined) this.#level = level;
    }

    /** @returns {boolean} */
    isActive() { return this.#level !== 'silent'; }

    /** Check if the given level is enabled */
    #enabled(lvl) {
      return FluentDebugger.LEVELS[lvl] <= FluentDebugger.LEVELS[this.#level];
    }

    /**
     * Log a successful request lifecycle (grouped).
     * @param {string} method
     * @param {string} url
     * @param {number} status
     * @param {number} duration
     * @param {*} [data]
     * @param {Object} [headers]
     * @param {*} [body]
     * @param {string} [requestId]
     * @param {number} [responseSize]
     */
    requestSuccess(method, url, status, duration, data, headers, body, requestId, responseSize) {
      if (!this.#enabled('info')) return;
      this._totalRequests++;
      this._totalDuration += duration;

      var idTag = requestId ? ' [' + requestId + ']' : '';
      var sizeTag = responseSize ? ' ~' + (responseSize > 1024 ? (responseSize / 1024).toFixed(1) + 'KB' : responseSize + 'B') : '';
      var label = '%c' + FluentDebugger.PREFIX + '%c ' + method + ' ' + url + idTag;

      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed(
          label + ' %c\u2192 ' + status + ' (' + duration + 'ms)' + sizeTag,
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.success
        );
        if (this.#enabled('verbose')) {
          if (requestId) console.log('%cRequest ID:%c ' + requestId, FluentDebugger.STYLES.dim, '');
          if (headers) console.log('%c\u2192 Headers:%c', FluentDebugger.STYLES.dim, '', this.#maskHeaders(headers));
          if (body !== undefined && body !== null) console.log('%c\u2192 Body:%c', FluentDebugger.STYLES.dim, '', this.#truncate(body));
          if (responseSize) console.log('%c\u2190 Size:%c ' + sizeTag.trim(), FluentDebugger.STYLES.dim, '');
        }
        if (data !== undefined) console.log('%c\u2190 Data:%c', FluentDebugger.STYLES.dim, '', this.#truncate(data));
        console.groupEnd();
      } else {
        console.log(
          label + ' %c\u2192 ' + status + ' (' + duration + 'ms)' + sizeTag,
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.success
        );
      }
    }

    /**
     * Log a failed request lifecycle (grouped).
     * @param {string} method
     * @param {string} url
     * @param {number} status
     * @param {number} duration
     * @param {string} message
     * @param {Object} [headers]
     * @param {*} [body]
     * @param {string} [requestId]
     */
    requestError(method, url, status, duration, message, headers, body, requestId) {
      if (!this.#enabled('error')) return;
      this._totalRequests++;
      this._totalErrors++;
      this._totalDuration += duration;

      var idTag = requestId ? ' [' + requestId + ']' : '';
      var label = '%c' + FluentDebugger.PREFIX + '%c ' + method + ' ' + url + idTag;

      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed(
          label + ' %c\u2192 ERROR ' + status + ' (' + duration + 'ms)',
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.error
        );
        if (this.#enabled('verbose')) {
          if (requestId) console.log('%cRequest ID:%c ' + requestId, FluentDebugger.STYLES.dim, '');
          if (headers) console.log('%c\u2192 Headers:%c', FluentDebugger.STYLES.dim, '', this.#maskHeaders(headers));
          if (body !== undefined && body !== null) console.log('%c\u2192 Body:%c', FluentDebugger.STYLES.dim, '', this.#truncate(body));
        }
        console.log('%c\u2190 Error:%c ' + message, FluentDebugger.STYLES.error, '');
        console.groupEnd();
      } else {
        console.warn(
          label + ' %c\u2192 ERROR ' + status + ' (' + duration + 'ms) ' + message,
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.error
        );
      }
    }

    /**
     * Log an informational message (cache hit, dedup, auto-init, etc.)
     * @param {string} msg
     */
    info(msg) {
      if (!this.#enabled('info')) return;
      console.log('%c' + FluentDebugger.PREFIX + '%c ' + msg, FluentDebugger.STYLES.label, '');
    }

    /**
     * Log a warning (retry, 422, etc.)
     * @param {string} msg
     */
    warn(msg) {
      if (!this.#enabled('warn')) return;
      console.warn('%c' + FluentDebugger.PREFIX + '%c ' + msg, FluentDebugger.STYLES.label, '');
    }

    /**
     * Log a verbose/debug message (headers, payloads, dedup, etc.)
     * @param {string} msg
     * @param {*} [data]
     */
    verbose(msg, data) {
      if (!this.#enabled('verbose')) return;
      if (data !== undefined) {
        console.log('%c' + FluentDebugger.PREFIX + '%c ' + msg, FluentDebugger.STYLES.verbose, '', data);
      } else {
        console.log('%c' + FluentDebugger.PREFIX + '%c ' + msg, FluentDebugger.STYLES.verbose, '');
      }
    }

    /**
     * Print a full state snapshot of the instance.
     * @param {FluentHttpAjaxify} instance
     */
    dump(instance) {
      var avgTime = this._totalRequests > 0 ? Math.round(this._totalDuration / this._totalRequests) : 0;
      var notifierName = instance._notifierName || (instance._notifier ? 'custom adapter' : 'none');

      console.log(
        '\n%c\u2550\u2550 FluentHttpAjaxify State \u2550\u2550%c\n'
        + 'Base URL:       ' + (instance._baseURL || '(empty)') + '\n'
        + 'Debug Level:    ' + this.#level + '\n'
        + 'CSRF:           ' + (instance._csrfToken ? '\u2713 (set)' : '\u2717 (not set)') + '\n'
        + 'Token:          ' + (instance._globalToken ? '\u2713 ' + instance._globalTokenScheme + ' ***' + instance._globalToken.slice(-4) : '\u2717 (not set)') + '\n'
        + 'Timeout:        ' + instance._timeout + 'ms\n'
        + 'Concurrency:    ' + (instance._concurrencyQueue ? 'enabled' : 'unlimited') + '\n'
        + 'Offline Queue:  ' + (instance._offlineQueue ? instance._offlineQueue.length + ' pending' : 'disabled') + '\n'
        + 'History:        ' + (instance._history ? instance._history.length + ' entries (max ' + instance._historyMax + ')' : 'disabled') + '\n'
        + 'Notifier:       ' + notifierName + '\n'
        + 'Bound Forms:    ' + instance._boundForms.length + '\n'
        + 'Mock Mode:      ' + (instance._mockRoutes ? '\u2713' : '\u2717') + '\n'
        + '\u2500\u2500 Performance \u2500\u2500\n'
        + 'Total Requests: ' + this._totalRequests + '\n'
        + 'Total Errors:   ' + this._totalErrors + '\n'
        + 'Avg Duration:   ' + avgTime + 'ms\n'
        + '%c\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550%c',
        FluentDebugger.STYLES.label, '',
        FluentDebugger.STYLES.label, ''
      );
    }

    /**
     * Print a builder's configuration without executing.
     * @param {Object} config  Plain object snapshot of builder state
     */
    inspect(config) {
      console.log(
        '\n%c\u2550\u2550 RequestBuilder Inspect \u2550\u2550%c\n'
        + 'Method:     ' + config.method + '\n'
        + 'Endpoint:   ' + config.endpoint + '\n'
        + 'Body:       ' + this.#truncateStr(this.#safeStringify(config.body), 200) + '\n'
        + 'Headers:    ' + this.#truncateStr(this.#safeStringify(this.#maskHeaders(config.headers || {})), 200) + '\n'
        + 'Params:     ' + this.#safeStringify(config.params || {}) + '\n'
        + 'Retry:      ' + (config.retryAttempts > 0 ? config.retryAttempts + ' attempts, ' + config.retryDelay + 'ms' + (config.retryExponential ? ', exponential' : '') : 'off') + '\n'
        + 'Cache:      ' + (config.cacheTtl > 0 ? (config.cacheTtl / 1000) + 's' : 'off') + '\n'
        + 'Timeout:    ' + (config.timeout != null ? config.timeout + 'ms' : 'default') + '\n'
        + 'RespType:   ' + (config.responseType || 'json (default)') + '\n'
        + 'Notify:     ' + this.#safeStringify(config.notifyOpts) + '\n'
        + 'Override:   ' + (config.methodOverride ? '\u2713' : '\u2717') + '\n'
        + '%c\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550%c',
        FluentDebugger.STYLES.label, '',
        FluentDebugger.STYLES.label, ''
      );
    }

    /** Mask sensitive header values using the SENSITIVE_HEADERS list */
    #maskHeaders(headers) {
      var masked = {};
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = headers[k];
        var isSensitive = false;
        var kLower = k.toLowerCase();
        for (var s = 0; s < SENSITIVE_HEADERS.length; s++) {
          if (kLower === SENSITIVE_HEADERS[s]) { isSensitive = true; break; }
        }
        if (isSensitive && typeof v === 'string' && v.length > 8) {
          // Preserve scheme prefix (e.g. "Bearer ") for readability
          var spaceIdx = v.indexOf(' ');
          masked[k] = (spaceIdx > 0 ? v.substring(0, spaceIdx + 1) : '') + '***' + v.slice(-4);
        } else if (isSensitive && typeof v === 'string') {
          masked[k] = '***';
        } else {
          masked[k] = v;
        }
      }
      return masked;
    }

    /** Truncate any value for display */
    #truncate(val) {
      if (val === null || val === undefined) return val;
      if (typeof FormData !== 'undefined' && val instanceof FormData) return this.#safeStringify(val);
      try {
        var str = typeof val === 'string' ? val : JSON.stringify(val);
        if (typeof str !== 'string') return String(val);
        return str.length > 500 ? str.substring(0, 500) + '...(truncated)' : (typeof val === 'string' ? val : JSON.parse(str));
      } catch (_) {
        return String(val);
      }
    }

    /** Truncate a string to maxLen chars */
    #truncateStr(str, maxLen) {
      if (!str || typeof str !== 'string') return String(str);
      return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    /** Safely stringify any value — handles FormData, circular refs, undefined */
    #safeStringify(val) {
      if (val === null) return 'null';
      if (val === undefined) return 'undefined';
      if (typeof FormData !== 'undefined' && val instanceof FormData) {
        var entries = [];
        val.forEach(function (v, k) {
          var isFile = (typeof File !== 'undefined' && v instanceof File) || (typeof Blob !== 'undefined' && v instanceof Blob);
          entries.push(k + ': ' + (isFile ? '[File ' + (v.name || 'blob') + ']' : v));
        });
        return 'FormData{' + entries.join(', ') + '}';
      }
      try {
        return JSON.stringify(val);
      } catch (_) {
        return String(val);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Error Formatter
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Formats an Axios error into a structured object.
   * Handles all three Axios error categories:
   *   - **Response error** (server replied with error status) → `status` = HTTP code
   *   - **Request error** (no response received)              → `status` = 0
   *   - **Config error** (request never sent)                 → `status` = -1
   *
   * @param {Error} error
   * @returns {{ status: number, message: string, errors: Object, raw: Error }}
   * @private
   */
  /**
   * Strip potentially sensitive information from error messages.
   * Removes stack traces, file paths, and internal server details.
   * @param {string} msg
   * @returns {string}
   * @private
   */
  function sanitizeErrorMessage(msg) {
    if (typeof msg !== 'string') return msg;
    // Strip file paths (Unix and Windows)
    var cleaned = msg.replace(/\s*(at\s+.*|\/[\w./\\-]+:\d+:\d+|[A-Z]:\\[\w\\.-]+:\d+)/g, '');
    // Strip stack trace lines
    cleaned = cleaned.replace(/\n\s*at\s+.*/g, '');
    // Strip common server-leaked details
    cleaned = cleaned.replace(/\bSQL\b.*$/i, '').replace(/\bstack\b.*$/i, '');
    return cleaned.trim() || msg;
  }

  function formatError(error) {
    if (error.response) {
      var respData = error.response.data;
      var message = (respData && respData.message) ? respData.message : error.message;
      var errors  = (respData && respData.errors) ? respData.errors : {};
      return {
        status:  error.response.status,
        message: sanitizeErrorMessage(message),
        errors:  errors,
        raw:     error,
      };
    }
    if (error.request) {
      return {
        status:  0,
        message: error.message ?? _REGISTRATION.messages.error.networkError,
        errors:  {},
        raw:     error,
      };
    }
    return {
      status:  -1,
      message: sanitizeErrorMessage(error.message ?? _REGISTRATION.messages.error.configError),
      errors:  {},
      raw:     error,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RequestBuilder
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Chainable request builder. Created by FluentHttpAjaxify instance
   * methods (`.get()`, `.post()`, etc.). **Do not instantiate directly.**
   *
   * Every `.send()` call returns a consistent shape and **never throws**:
   * ```js
   * { data: *|null, error: Object|null, status: number }
   * ```
   */
  class RequestBuilder {
    /** @type {FluentHttpAjaxify} */ #client;
    /** @type {string} */                #method;
    /** @type {string} */                #endpoint;
    /** @type {*} */                     #payload         = null;
    /** @type {Object<string,string>} */ #headers         = {};
    /** @type {Object} */                #params          = {};
    /** @type {?function} */             #onSuccess       = null;
    /** @type {?function} */             #onError         = null;
    /** @type {?function} */             #onFinally       = null;
    /** @type {?function} */             #onProgress      = null;
    /** @type {?AbortController} */      #abortCtrl       = null;
    /** @type {number} */                #retryAttempts   = 0;
    /** @type {number} */                #retryDelay      = 0;
    /** @type {boolean} */               #retryExponential = false;
    /** @type {number} */                #cacheTtl        = 0;
    /** @type {?number} */               #timeout         = null;
    /** @type {?string} */               #responseType    = null;
    /** @type {boolean} */               #sent            = false;
    /** @type {EventEmitter} */          #events          = new EventEmitter();
    /** @type {?Object|boolean} */       #notifyOpts      = null;
    /** @type {Object} */                #extraOptions    = {};
    /** @type {boolean} */               #methodOverride  = false;
    /** @type {?MiddlewareStack} */      #middleware       = null;
    /** @type {boolean} */               #noProtocolFlash  = false;
    /** @type {boolean} */               #protocolFlashShown = false;

    /**
     * @param {FluentHttpAjaxify} client
     * @param {string} method  HTTP verb
     * @param {string} endpoint  URL path appended to baseURL
     * @param {*} [payload=null]  Request body
     */
    constructor(client, method, endpoint, payload) {
      this.#client   = client;
      this.#method   = method.toUpperCase();
      this.#endpoint = endpoint;
      this.#payload  = payload !== undefined ? payload : null;
    }

    // ── Auth ──────────────────────────────────────────────────────────────

    /**
     * Set the Authorization header for **this request only**.
     * Ignored if `token` is null/empty.
     *
     * @param {string} token
     * @param {string} [scheme='Bearer']
     * @returns {RequestBuilder}
     */
    withToken(token, scheme) {
      if (token != null && token !== '') {
        this.#headers['Authorization'] = (scheme || 'Bearer') + ' ' + token;
      }
      return this;
    }

    /**
     * Set the CSRF token header for **this request only**.
     * Ignored if `token` is null/empty.
     *
     * @param {string} token
     * @returns {RequestBuilder}
     */
    withCsrf(token) {
      if (token != null && token !== '') {
        this.#headers['X-CSRF-TOKEN'] = token;
      }
      return this;
    }

    // ── Body, Headers & Params ────────────────────────────────────────────

    /**
     * Set the request body (JSON payload).
     * @param {*} data
     * @returns {RequestBuilder}
     */
    withBody(data) {
      this.#payload = data;
      return this;
    }

    /**
     * Set a single request header.
     * @param {string} key
     * @param {string} value
     * @returns {RequestBuilder}
     */
    withHeader(key, value) {
      this.#headers[key] = value;
      return this;
    }

    /**
     * Merge multiple request headers.
     * @param {Object<string,string>} headers
     * @returns {RequestBuilder}
     */
    withHeaders(headers) {
      if (headers && typeof headers === 'object') {
        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) {
          this.#headers[keys[i]] = headers[keys[i]];
        }
      }
      return this;
    }

    /**
     * Set a single URL query parameter.
     * @param {string} key
     * @param {*} value
     * @returns {RequestBuilder}
     */
    withParam(key, value) {
      this.#params[key] = value;
      return this;
    }

    /**
     * Merge multiple URL query parameters.
     * @param {Object} params
     * @returns {RequestBuilder}
     */
    withParams(params) {
      if (params && typeof params === 'object') {
        var keys = Object.keys(params);
        for (var i = 0; i < keys.length; i++) {
          this.#params[keys[i]] = params[keys[i]];
        }
      }
      return this;
    }

    // ── File Upload ───────────────────────────────────────────────────────

    /**
     * Attach a single file. Automatically converts the payload to `FormData`.
     * Any previously set plain-object body fields are carried over.
     *
     * @param {string} fieldName  The form field name
     * @param {File|Blob} file    The file to attach
     * @returns {RequestBuilder}
     */
    withFile(fieldName, file) {
      if (!(this.#payload instanceof FormData)) {
        var prev = this.#payload;
        this.#payload = new FormData();
        if (prev && typeof prev === 'object' && !(prev instanceof FormData)) {
          var keys = Object.keys(prev);
          for (var i = 0; i < keys.length; i++) {
            this.#payload.append(keys[i], prev[keys[i]]);
          }
        }
      }
      this.#payload.append(fieldName, file);
      return this;
    }

    /**
     * Attach multiple files, or replace the payload with an existing `FormData`.
     *
     * @param {FormData|Object<string,File>} files
     * @returns {RequestBuilder}
     */
    withFiles(files) {
      if (files instanceof FormData) {
        this.#payload = files;
      } else if (files && typeof files === 'object') {
        if (!(this.#payload instanceof FormData)) {
          var prev = this.#payload;
          this.#payload = new FormData();
          if (prev && typeof prev === 'object' && !(prev instanceof FormData)) {
            var pKeys = Object.keys(prev);
            for (var p = 0; p < pKeys.length; p++) {
              this.#payload.append(pKeys[p], prev[pKeys[p]]);
            }
          }
        }
        var keys = Object.keys(files);
        for (var i = 0; i < keys.length; i++) {
          this.#payload.append(keys[i], files[keys[i]]);
        }
      }
      return this;
    }

    // ── Cancellation ──────────────────────────────────────────────────────

    /**
     * Attach an external `AbortController` for request cancellation.
     *
     * @param {AbortController} controller
     * @returns {RequestBuilder}
     */
    cancelWith(controller) {
      this.#abortCtrl = controller;
      return this;
    }

    /**
     * Create and return an internal `AbortController`.
     * Call `.abort()` on it to cancel the in-flight request.
     *
     * @returns {AbortController} The controller (call `.abort()` on it)
     */
    abortable() {
      this.#abortCtrl = new AbortController();
      return this.#abortCtrl;
    }

    // ── Retry ─────────────────────────────────────────────────────────────

    /**
     * Enable automatic retry on transient failures.
     * **Does not retry on 4xx client errors or cancelled requests.**
     *
     * @param {number} [attempts=3]    Max retry attempts
     * @param {number} [delayMs=300]   Base delay between retries (ms)
     * @param {{ exponential?: boolean }} [options={}]
     * @returns {RequestBuilder}
     */
    retry(attempts, delayMs, options) {
      this.#retryAttempts    = Math.max(0, attempts != null ? attempts : 3);
      this.#retryDelay       = Math.max(0, delayMs != null ? delayMs : 300);
      this.#retryExponential = !!(options && options.exponential);
      return this;
    }

    // ── Caching ───────────────────────────────────────────────────────────

    /**
     * Cache the response in memory for the given duration (GET requests only).
     * Subsequent identical GETs within the TTL return the cached result instantly.
     *
     * @param {number} ttlSeconds
     * @returns {RequestBuilder}
     */
    cache(ttlSeconds) {
      this.#cacheTtl = Math.max(0, ttlSeconds) * 1000;
      return this;
    }

    // ── Timeout ───────────────────────────────────────────────────────────

    /**
     * Override the instance-level timeout for this request.
     *
     * @param {number} ms  Timeout in milliseconds
     * @returns {RequestBuilder}
     */
    withTimeout(ms) {
      this.#timeout = Math.max(0, ms);
      return this;
    }

    // ── Response Types ────────────────────────────────────────────────────

    /**
     * Expect a Blob response (e.g. file downloads).
     * @returns {RequestBuilder}
     */
    asBlob() {
      this.#responseType = 'blob';
      return this;
    }

    /**
     * Expect a plain text response.
     * @returns {RequestBuilder}
     */
    asText() {
      this.#responseType = 'text';
      return this;
    }

    /**
     * Expect an ArrayBuffer response (binary data).
     * @returns {RequestBuilder}
     */
    asArrayBuffer() {
      this.#responseType = 'arraybuffer';
      return this;
    }

    /**
     * Expect a stream response (Node.js only).
     * @returns {RequestBuilder}
     */
    asStream() {
      this.#responseType = 'stream';
      return this;
    }

    // ── Callbacks ─────────────────────────────────────────────────────────

    /**
     * Per-request success callback.
     * @param {function(*, Object): void} fn  Receives `(data, axiosResponse)`
     * @returns {RequestBuilder}
     */
    onSuccess(fn) {
      this.#onSuccess = fn;
      return this;
    }

    /**
     * Per-request error callback.
     * @param {function(Object): void} fn  Receives the formatted error object
     * @returns {RequestBuilder}
     */
    onError(fn) {
      this.#onError = fn;
      return this;
    }

    /**
     * Per-request finally callback (always executes).
     * @param {function(): void} fn
     * @returns {RequestBuilder}
     */
    onFinally(fn) {
      this.#onFinally = fn;
      return this;
    }

    /**
     * Upload / download progress callback.
     * Receives a percentage from 0 to 100.
     *
     * @param {function(number): void} fn
     * @returns {RequestBuilder}
     */
    onProgress(fn) {
      this.#onProgress = fn;
      return this;
    }

    // ── Per-Request Events ────────────────────────────────────────────────

    /**
     * Register a per-request event listener.
     * Supports all events: `success`, `error`, `error:422`, `start`, `complete`, etc.
     *
     * @param {string} event
     * @param {function} fn
     * @returns {RequestBuilder}
     */
    on(event, fn) {
      this.#events.on(event, fn);
      return this;
    }

    /**
     * Register a one-shot per-request event listener.
     *
     * @param {string} event
     * @param {function} fn
     * @returns {RequestBuilder}
     */
    once(event, fn) {
      this.#events.once(event, fn);
      return this;
    }

    /**
     * Per-request loading start callback.
     * Shorthand for `.on('start', fn)`.
     *
     * @param {function} fn
     * @returns {RequestBuilder}
     */
    onStart(fn) {
      this.#events.on('start', fn);
      return this;
    }

    /**
     * Per-request loading complete callback (fires on success OR error).
     * Shorthand for `.on('complete', fn)`.
     *
     * @param {function} fn
     * @returns {RequestBuilder}
     */
    onComplete(fn) {
      this.#events.on('complete', fn);
      return this;
    }

    // ── Notification ──────────────────────────────────────────────────────

    /**
     * Enable toast notifications for this request.
     *
     * @param {boolean|{ success?: string, error?: string }} opts
     *   - `true` — use default messages
     *   - `{ success: 'Saved!', error: 'Failed' }` — custom messages
     * @returns {RequestBuilder}
     */
    notify(opts) {
      this.#notifyOpts = opts != null ? opts : true;
      return this;
    }

    /**
     * Suppress protocol flash message processing for this request.
     * Useful when you want to handle notifications manually.
     *
     * @returns {RequestBuilder}
     */
    withoutProtocolFlash() {
      this.#noProtocolFlash = true;
      return this;
    }

    // ── Extra Options ─────────────────────────────────────────────────────

    /**
     * Merge arbitrary Axios config options (escape hatch).
     * E.g. `{ withCredentials: true, maxRedirects: 5 }`.
     *
     * @param {Object} opts
     * @returns {RequestBuilder}
     */
    withOptions(opts) {
      if (opts && typeof opts === 'object') {
        var keys = Object.keys(opts);
        for (var i = 0; i < keys.length; i++) {
          this.#extraOptions[keys[i]] = opts[keys[i]];
        }
      }
      return this;
    }

    /**
     * Use HTTP method override — sends the request as POST with
     * `X-HTTP-Method-Override` header and `_method` field.
     * Useful for servers/proxies that reject PUT/PATCH/DELETE.
     *
     * @returns {RequestBuilder}
     */
    withMethodOverride() {
      this.#methodOverride = true;
      return this;
    }

    // ── Accept Header Shortcuts ───────────────────────────────────────────

    /**
     * Set Accept header to `application/json` (default).
     * @returns {RequestBuilder}
     */
    asJson() {
      this.#headers['Accept'] = 'application/json';
      return this;
    }

    /**
     * Set Accept header to `text/html`.
     * @returns {RequestBuilder}
     */
    asHtml() {
      this.#headers['Accept'] = 'text/html';
      return this;
    }

    /**
     * Set Accept header to {@code *\/*} (any content type).
     * @returns {RequestBuilder}
     */
    asAny() {
      this.#headers['Accept'] = '*/*';
      return this;
    }

    // ── Convenience Methods ────────────────────────────────────────────────

    /**
     * Enable cross-origin cookie/credential sending for this request.
     * Sets `withCredentials: true` on the underlying Axios config.
     *
     * @returns {RequestBuilder}
     */
    withCredentials() {
      this.#extraOptions.withCredentials = true;
      return this;
    }

    /**
     * Enable protocol processing for this specific request.
     * When enabled, the response will be processed through ResponseProtocol
     * even if the client-level `protocol` option is not set.
     *
     * @param {Object} [opts]  Protocol processing options for this request
     * @returns {RequestBuilder}
     */
    withProtocol(opts) {
      this.#extraOptions._forceProtocol = true;
      this.#extraOptions._protocolOpts = opts || {};
      return this;
    }

    /**
     * Set Content-Type to `application/x-www-form-urlencoded`.
     * Axios will auto-serialize the payload to URL-encoded form.
     *
     * @returns {RequestBuilder}
     */
    asFormEncoded() {
      this.#headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return this;
    }

    /**
     * Configure the request as a file download.
     * Sets responseType to 'blob' and optionally triggers a browser download.
     *
     * @param {string} [filename]  If provided, auto-triggers download with this filename
     * @returns {RequestBuilder}
     */
    download(filename) {
      this.#responseType = 'blob';
      if (filename) {
        var origSuccess = this.#onSuccess;
        this.#onSuccess = function (data, response) {
          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            var blob = data instanceof Blob ? data : new Blob([data]);
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
          }
          if (origSuccess) origSuccess(data, response);
        };
      }
      return this;
    }

    // ── Middleware ─────────────────────────────────────────────────────────

    /**
     * Add per-request middleware. Lazily creates a per-request MiddlewareStack.
     * These middleware wrap around the instance-level middleware stack.
     *
     * @param {function} middleware  `(next) → async (config) → result`
     * @param {string} [name]       Optional name for targeting
     * @returns {RequestBuilder}
     *
     * @example
     * api.post('/users')
     *   .use(Middleware.validation({ email: 'required|email' }))
     *   .use(Middleware.retry({ attempts: 2 }))
     *   .send();
     */
    use(middleware, name) {
      if (!this.#middleware) this.#middleware = new MiddlewareStack();
      this.#middleware.push(middleware, name);
      return this;
    }

    /**
     * Get the per-request middleware stack (may be null if none added).
     * @returns {?MiddlewareStack}
     */
    getMiddleware() {
      return this.#middleware;
    }

    // ── Clone ─────────────────────────────────────────────────────────────

    /**
     * Clone this builder into a new unsent copy with the same configuration.
     *
     * @returns {RequestBuilder}
     */
    clone() {
      var clonedPayload = this.#payload;
      if (clonedPayload && typeof clonedPayload === 'object' && !(typeof FormData !== 'undefined' && clonedPayload instanceof FormData)) {
        clonedPayload = safeAssign({}, clonedPayload);
      }
      var b = new RequestBuilder(this.#client, this.#method, this.#endpoint, clonedPayload);
      var hKeys = Object.keys(this.#headers);
      for (var i = 0; i < hKeys.length; i++) b.#headers[hKeys[i]] = this.#headers[hKeys[i]];
      var pKeys = Object.keys(this.#params);
      for (var j = 0; j < pKeys.length; j++) b.#params[pKeys[j]] = this.#params[pKeys[j]];
      b.#retryAttempts    = this.#retryAttempts;
      b.#retryDelay       = this.#retryDelay;
      b.#retryExponential = this.#retryExponential;
      b.#cacheTtl         = this.#cacheTtl;
      b.#timeout          = this.#timeout;
      b.#responseType     = this.#responseType;
      b.#methodOverride   = this.#methodOverride;
      var eKeys = Object.keys(this.#extraOptions);
      for (var k = 0; k < eKeys.length; k++) b.#extraOptions[eKeys[k]] = this.#extraOptions[eKeys[k]];
      b.#notifyOpts = this.#notifyOpts;
      if (this.#middleware) b.#middleware = this.#middleware.clone();
      return b;
    }

    // ── Inspect ────────────────────────────────────────────────────────────

    /**
     * Print the builder's configuration to the console without executing.
     * Useful for debugging request setup before sending.
     * Works regardless of the instance debug level.
     *
     * @returns {RequestBuilder}
     */
    inspect() {
      this.#client._debugger.inspect({
        method:           this.#method,
        endpoint:         this.#endpoint,
        body:             this.#payload,
        headers:          this.#headers,
        params:           this.#params,
        retryAttempts:    this.#retryAttempts,
        retryDelay:       this.#retryDelay,
        retryExponential: this.#retryExponential,
        cacheTtl:         this.#cacheTtl,
        timeout:          this.#timeout,
        responseType:     this.#responseType,
        notifyOpts:       this.#notifyOpts,
        methodOverride:   this.#methodOverride,
      });
      return this;
    }

    // ── Pagination ────────────────────────────────────────────────────────

    /**
     * Auto-paginate through a paginated API endpoint.
     * Stops when a page returns fewer items than `limit` or when `maxPages` is reached.
     *
     * @param {{ pageParam?: string, limitParam?: string, limit?: number, startPage?: number, onPage?: function, maxPages?: number }} [options={}]
     * @returns {Promise<{ data: Array, error: Object|null, status: number }>}
     *
     * @example
     * const { data } = await api.get('/users')
     *   .paginate({ limit: 20, onPage: (items, page) => console.log('Page', page) });
     */
    async paginate(options) {
      var opts = options || {};
      var pageParam  = opts.pageParam  || 'page';
      var limitParam = opts.limitParam || 'per_page';
      var limit      = opts.limit      || 20;
      var startPage  = opts.startPage  || 1;
      var onPage     = opts.onPage     || null;
      var maxPages   = opts.maxPages != null ? opts.maxPages : Infinity;

      var allData    = [];
      var page       = startPage;
      var lastStatus = 200;
      var pagesLoaded = 0;

      try {
        while (pagesLoaded < maxPages) {
          this.#params[pageParam]  = page;
          this.#params[limitParam] = limit;
          this.#sent = false; // allow re-send for each page

          var result = await this.#execute();

          if (result.error) {
            return { data: allData, error: result.error, status: result.status };
          }

          lastStatus = result.status;

          // Support { data: [...] } wrapper (e.g. Laravel) and plain arrays
          var pageData = Array.isArray(result.data)
            ? result.data
            : (result.data && Array.isArray(result.data.data) ? result.data.data : []);

          for (var i = 0; i < pageData.length; i++) {
            allData.push(pageData[i]);
          }

          if (onPage) { try { onPage(pageData, page, result.data); } catch (e) { console.error('[FluentHttp] paginate onPage callback error:', e); } }

          if (pageData.length === 0 || pageData.length < limit) break;

          page++;
          pagesLoaded++;
        }

        return { data: allData, error: null, status: lastStatus };
      } finally {
        this.#sent = true; // prevent accidental .send() after pagination
      }
    }

    // ── Execute ───────────────────────────────────────────────────────────

    /**
     * Execute the request.
     *
     * Returns a **consistent shape** and **never throws**:
     * ```js
     * { data: *|null, error: Object|null, status: number }
     * ```
     *
     * @returns {Promise<{ data: *|null, error: { status: number, message: string, errors: Object, raw: Error }|null, status: number }>}
     */
    async send() {
      if (this.#sent) {
        return {
          data:   null,
          error:  {
            status:  -1,
            message: _REGISTRATION.messages.error.alreadySent,
            errors:  {},
            raw:     null,
          },
          status: -1,
        };
      }
      this.#sent = true;
      return this.#execute();
    }

    /**
     * Thenable — allows `await builder` without calling `.send()` explicitly.
     *
     * @param {function} [resolve]
     * @param {function} [reject]
     * @returns {Promise}
     */
    then(resolve, reject) {
      return this.send().then(resolve, reject);
    }

    // ── Internal Execution Pipeline ───────────────────────────────────────

    /** @private */
    async #execute() {
      var client = this.#client;

      // Offline detection — queue and resolve when back online
      if (!isOnline() && client._offlineQueue) {
        var self = this;
        client._events.emit('offline:queued', { method: this.#method, url: client._baseURL + this.#endpoint });
        this.#events.emit('offline:queued', { method: this.#method, url: client._baseURL + this.#endpoint });
        return new Promise(function (resolve) {
          client._offlineQueue.enqueue(function () {
            self.#sent = false;
            self.send().then(resolve);
          });
        });
      }

      // Concurrency gate
      if (client._concurrencyQueue) {
        await client._concurrencyQueue.acquire();
      }

      try {
        // ── Middleware pipeline ────────────────────────────────────────
        // Core handler wraps the existing #doRequest logic.
        // Middleware receives a config object matching the standard shape:
        //   { method, url, params, headers, data, ... }
        // and must return { data, error, status }.
        var self = this;
        var coreHandler = async function (cfg) {
          return self.#doRequest();
        };

        // Compose: instance-level middleware wraps core, per-request wraps that
        var handler = coreHandler;
        if (client._middleware && client._middleware.length > 0) {
          handler = client._middleware.resolve(handler);
        }
        if (this.#middleware && this.#middleware.length > 0) {
          handler = this.#middleware.resolve(handler);
        }

        // Build config object for middleware (informational + mutable)
        var middlewareConfig = {
          method:  this.#method,
          url:     client._baseURL + this.#endpoint,
          params:  this.#params,
          headers: safeAssign({}, client._defaultHeaders, this.#headers),
          data:    this.#payload,
        };

        return await handler(middlewareConfig);
      } finally {
        if (client._concurrencyQueue) {
          client._concurrencyQueue.release();
        }
      }
    }

    /** @private */
    async #doRequest() {
      var client = this.#client;
      var url    = client._baseURL + this.#endpoint;
      var key    = requestKey(this.#method, url, this.#params);

      // ── Mock mode ────────────────────────────────────────────────────
      if (client._mockRoutes) {
        var mockKey  = this.#method + ':' + this.#endpoint;
        var mockData = client._mockRoutes[mockKey];
        if (mockData === undefined) mockData = client._mockRoutes[this.#endpoint];

        if (mockData !== undefined) {
          var data = typeof mockData === 'function'
            ? mockData(this.#params, this.#payload)
            : mockData;
          var mockResult = { data: data, error: null, status: 200 };
          try { this.#handleSuccess(data, { data: data, status: 200, headers: {} }, 0); } catch (cbErr) { console.error('[FluentHttp] Callback error in mock success handler:', cbErr); }
          return mockResult;
        }
      }

      // ── Cache hit (GET only) ─────────────────────────────────────────
      if (this.#method === 'GET' && this.#cacheTtl > 0) {
        var cached = client._cache.get(key);
        if (cached !== undefined) {
          try { this.#handleSuccess(cached.data, cached, 0); } catch (cbErr) { console.error('[FluentHttp] Callback error in cache success handler:', cbErr); }
          return { data: cached.data, error: null, status: cached.status };
        }
      }

      // ── Deduplication (GET only) ─────────────────────────────────────
      // BUG FIX: clone the resolved result so THIS builder's callbacks fire
      if (this.#method === 'GET' && client._dedup.has(key)) {
        var self = this;
        return client._dedup.get(key).then(function (result) {
          try {
            if (result.error) {
              self.#handleError(result.error, 0);
            } else {
              self.#handleSuccess(result.data, { data: result.data, status: result.status }, 0);
            }
          } catch (cbErr) { console.error('[FluentHttp] Callback error in dedup handler:', cbErr); }
          return { data: result.data, error: result.error, status: result.status };
        });
      }

      var promise = this.#fireRequest(url, key, 0);

      if (this.#method === 'GET') {
        client._dedup.set(key, promise);
      }

      return promise;
    }

    /**
     * Centralized success handler — fires all callbacks and events.
     * @param {*} data
     * @param {Object} response
     * @param {number} duration
     * @private
     */
    #handleSuccess(data, response, duration) {
      var client = this.#client;
      var payload = { data: data, response: response, status: response.status };

      // Custom success handler override
      if (client._customSuccessHandler) {
        try { client._customSuccessHandler(data, response, duration); } catch (e) { console.error('[FluentHttp] custom success handler error:', e); }
      }

      // Per-request callbacks — individually protected so #onFinally always fires
      if (this.#onSuccess) { try { this.#onSuccess(data, response); } catch (e) { console.error('[FluentHttp] onSuccess callback error:', e); } }
      if (this.#onFinally) { try { this.#onFinally(); } catch (e) { console.error('[FluentHttp] onFinally callback error:', e); } }

      // Per-request events
      this.#events.emit('success', payload);
      this.#events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration });

      // Instance-level events
      client._events.emit('success', payload);
      client._events.emit('response', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration, data: data });
      client._events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration });

      // Global callbacks (backward compat) — protected so notifications still fire
      if (client._globalOnSuccess) { try { client._globalOnSuccess(data, response); } catch (e) { console.error('[FluentHttp] global onSuccess callback error:', e); } }

      // Notifications
      this.#handleNotify('success', data);
    }

    /**
     * Centralized error handler — fires all callbacks and events.
     * @param {Object} formatted  Formatted error object
     * @param {number} duration
     * @private
     */
    #handleError(formatted, duration) {
      var client = this.#client;

      // Custom error handler override
      if (client._customErrorHandler) {
        try { client._customErrorHandler(formatted, duration); } catch (e) { console.error('[FluentHttp] custom error handler error:', e); }
      }

      // Per-request callbacks — individually protected so #onFinally always fires
      if (this.#onError) { try { this.#onError(formatted); } catch (e) { console.error('[FluentHttp] onError callback error:', e); } }
      if (this.#onFinally) { try { this.#onFinally(); } catch (e) { console.error('[FluentHttp] onFinally callback error:', e); } }

      // Per-request events
      this.#events.emit('error', { error: formatted, status: formatted.status });
      if (formatted.status > 0) this.#events.emit('error:' + formatted.status, { error: formatted });
      if (formatted.status === 0) this.#events.emit('error:network', { error: formatted });
      if (formatted.status === 422) this.#events.emit('validation', { errors: formatted.errors, message: formatted.message, status: 422 });
      this.#events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: formatted.status, duration: duration });

      // Instance-level events
      client._events.emit('error', { error: formatted, status: formatted.status });
      if (formatted.status > 0) client._events.emit('error:' + formatted.status, { error: formatted });
      if (formatted.status === 0) client._events.emit('error:network', { error: formatted });
      if (formatted.status === 422) client._events.emit('validation', { errors: formatted.errors, message: formatted.message, status: 422 });
      client._events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: formatted.status, duration: duration });

      // Global callbacks (backward compat) — protected so notifications still fire
      if (client._globalOnError) { try { client._globalOnError(formatted); } catch (e) { console.error('[FluentHttp] global onError callback error:', e); } }

      // Notifications
      this.#handleNotify('error', formatted);
    }

    /**
     * Fire notifications if enabled (per-request or global auto-notify).
     * @param {'success'|'error'} type
     * @param {*} payload
     * @private
     */
    #handleNotify(type, payload) {
      var client   = this.#client;
      var notifier = client._notifier;
      if (!notifier) return;

      var opts = this.#notifyOpts;
      var auto = client._autoNotify;
      var msg  = null;

      // Skip auto-notify when protocol already showed flash messages
      // (prevents triple-notification). Explicit per-request .notify() still fires.
      var protocolHandled = this.#protocolFlashShown;

      if (type === 'success') {
        if (opts && typeof opts === 'object' && opts.success) msg = opts.success;
        else if (opts === true) msg = 'Request successful';
        else if (!protocolHandled && auto && auto.success) msg = typeof auto.success === 'string' ? auto.success : 'Request successful';
        if (msg) notifier.success(msg);
      } else if (type === 'error') {
        // Per-request opts always take priority over global auto-notify
        if (opts && typeof opts === 'object' && opts.error) msg = opts.error;
        else if (opts === true) msg = payload.message || 'Request failed';

        if (msg) {
          // Per-request message wins — show it regardless of status code
          notifier.error(msg);
        } else if (protocolHandled) {
          // Protocol already showed flash — skip auto-notify
          return;
        } else if (payload.status === 422 && auto && auto.validation) {
          var valMsg = typeof auto.validation === 'string' ? auto.validation : (payload.message || 'Validation failed');
          notifier.warning(valMsg);
        } else if (payload.status === 403 && auto && auto.error !== false) {
          notifier.error('Permission denied');
        } else if (payload.status === 404 && auto && auto.error !== false) {
          notifier.error('Resource not found');
        } else if (payload.status === 429 && auto && auto.error !== false) {
          notifier.warning('Too many requests — please try again later');
        } else if ((payload.status === 500 || payload.status === 503) && auto && auto.error !== false) {
          notifier.error('Server error — please try again later');
        } else if (payload.status === 0 && auto && auto.networkError) {
          notifier.error(typeof auto.networkError === 'string' ? auto.networkError : 'No internet connection');
        } else if (auto && auto.error) {
          notifier.error(typeof auto.error === 'string' ? auto.error : (payload.message || 'Request failed'));
        }
      }
    }

    /**
     * @param {string} url       Full URL
     * @param {string} cacheKey  Key for cache storage
     * @param {number} attempt   Current attempt index (0-based)
     * @returns {Promise<{ data: *|null, error: Object|null, status: number }>}
     * @private
     */
    async #fireRequest(url, cacheKey, attempt) {
      var client    = this.#client;
      var method    = this.#method;
      var payload   = this.#payload;
      var isForm    = typeof FormData !== 'undefined' && payload instanceof FormData;
      var startTime = Date.now();
      var duration;

      // Generate request ID for tracing
      FluentHttpAjaxify._requestIdCounter = (FluentHttpAjaxify._requestIdCounter || 0) + 1;
      var requestId = 'req-' + FluentHttpAjaxify._requestIdCounter;

      // ── Security: URL sanitization ──────────────────────────────────
      try {
        url = sanitizeUrl(url);
      } catch (urlErr) {
        return { data: null, error: { status: -1, message: urlErr.message, errors: {}, raw: urlErr }, status: -1 };
      }

      // ── Security: HTTPS enforcement ─────────────────────────────────
      if (client._requireHttps && url.indexOf('http://') === 0) {
        var isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:|\/|$)/.test(url);
        if (!isLocalhost) {
          var httpsErr = new Error('[FluentHttp] HTTPS required but URL uses http://: ' + url.substring(0, 50));
          return { data: null, error: { status: -1, message: httpsErr.message, errors: {}, raw: httpsErr }, status: -1 };
        }
      }

      // ── Security: Allowed origins ───────────────────────────────────
      if (client._allowedOrigins && Array.isArray(client._allowedOrigins) && client._allowedOrigins.length > 0) {
        try {
          var parsedUrl = new URL(url, isBrowser() ? window.location.origin : undefined);
          var originAllowed = false;
          for (var oi = 0; oi < client._allowedOrigins.length; oi++) {
            if (parsedUrl.origin === client._allowedOrigins[oi] || url.indexOf(client._allowedOrigins[oi]) === 0) {
              originAllowed = true;
              break;
            }
          }
          if (!originAllowed && parsedUrl.origin !== 'null') {
            var originErr = new Error('[FluentHttp] Request to non-whitelisted origin: ' + parsedUrl.origin);
            return { data: null, error: { status: -1, message: originErr.message, errors: {}, raw: originErr }, status: -1 };
          }
        } catch (_) {
          // Relative URL — allowed (same origin)
        }
      }

      // ── Security: Body size guard ───────────────────────────────────
      if (client._maxRequestBodySize > 0 && exceedsBodySize(payload, client._maxRequestBodySize)) {
        var sizeErr = new Error('[FluentHttp] Request body exceeds maximum size (' + client._maxRequestBodySize + ' bytes)');
        return { data: null, error: { status: -1, message: sizeErr.message, errors: {}, raw: sizeErr }, status: -1 };
      }

      // ── Method Override ───────────────────────────────────────────────
      if (this.#methodOverride && method !== 'GET' && method !== 'POST') {
        if (isForm) {
          // Clone FormData to avoid mutating the original on retry
          var clonedFd = new FormData();
          payload.forEach(function (v, k) { clonedFd.append(k, v); });
          clonedFd.append('_method', method);
          payload = clonedFd;
        } else if (payload && typeof payload === 'object') {
          payload = safeAssign({}, payload, { _method: method });
        } else {
          // No body — create one with just the _method field
          payload = { _method: method };
        }
        method = 'POST';
      }

      // ── Build headers ────────────────────────────────────────────────
      var headers = {};
      var hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      if (hasBody && !isForm) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Accept']           = 'application/json';
      headers['X-Requested-With'] = 'XMLHttpRequest';

      if (this.#methodOverride && this.#method !== 'GET' && this.#method !== 'POST') {
        headers['X-HTTP-Method-Override'] = this.#method;
      }

      // CSRF: use configurable header name + optional cookie double-submit
      if (client._csrfToken) {
        headers[client._csrfHeaderName] = client._csrfToken;
        // Also send X-XSRF-TOKEN if using cookie-based CSRF (double-submit pattern)
        if (client._csrfCookieName) {
          var cookieToken = readCsrfCookie(client._csrfCookieName);
          if (cookieToken) {
            headers['X-XSRF-TOKEN'] = cookieToken;
          }
        }
      }
      if (client._globalToken) {
        headers['Authorization'] = client._globalTokenScheme + ' ' + client._globalToken;
      }

      // Merge instance defaults, then per-request overrides
      var defaultKeys = Object.keys(client._defaultHeaders);
      for (var i = 0; i < defaultKeys.length; i++) {
        headers[defaultKeys[i]] = client._defaultHeaders[defaultKeys[i]];
      }
      var overrideKeys = Object.keys(this.#headers);
      for (var j = 0; j < overrideKeys.length; j++) {
        headers[overrideKeys[j]] = this.#headers[overrideKeys[j]];
      }

      // ── Security: Header CRLF injection prevention ──────────────────
      var headerKeys = Object.keys(headers);
      for (var hi = 0; hi < headerKeys.length; hi++) {
        try {
          validateHeaderValue(headerKeys[hi], headers[headerKeys[hi]]);
        } catch (hdrErr) {
          return { data: null, error: { status: -1, message: hdrErr.message, errors: {}, raw: hdrErr }, status: -1 };
        }
      }

      // ── Axios config ─────────────────────────────────────────────────
      var config = {
        method:  method,
        url:     url,
        data:    payload,
        params:  this.#params,
        headers: headers,
        timeout: this.#timeout != null ? this.#timeout : client._timeout,
      };

      if (this.#abortCtrl) {
        config.signal = this.#abortCtrl.signal;
      }
      if (this.#responseType) {
        config.responseType = this.#responseType;
      }

      // Merge extra Axios options (escape hatch)
      var extraKeys = Object.keys(this.#extraOptions);
      for (var k = 0; k < extraKeys.length; k++) {
        config[extraKeys[k]] = this.#extraOptions[extraKeys[k]];
      }

      // Progress callbacks
      if (this.#onProgress) {
        var progressFn = this.#onProgress;
        config.onUploadProgress = function (e) {
          if (e.total) progressFn(Math.round((e.loaded / e.total) * 100));
        };
        config.onDownloadProgress = function (e) {
          if (e.total) progressFn(Math.round((e.loaded / e.total) * 100));
        };
      }

      // ── Emit start events ─────────────────────────────────────────────
      var startPayload = { method: this.#method, url: url };
      this.#events.emit('start', startPayload);
      client._events.emit('start', startPayload);
      client._events.emit('request', {
        method:  this.#method,
        url:     url,
        params:  this.#params,
        headers: headers,
        body:    payload,
      });

      // Pre-request hook (backward compat) — protected so hook errors don't kill the request
      if (client._onRequestHook) {
        try {
          client._onRequestHook({
            method:  this.#method,
            url:     url,
            params:  this.#params,
            headers: headers,
            body:    payload,
          });
        } catch (hookErr) { console.error('[FluentHttp] onRequest hook error:', hookErr); }
      }

      // ── Fire ─────────────────────────────────────────────────────────
      try {
        var response = await axios(config);
        duration = Date.now() - startTime;
        var data     = response.data;

        // Post-response hook (backward compat) — protected so hook errors don't corrupt response handling
        if (client._onResponseHook) {
          try {
            client._onResponseHook({
              method:   this.#method,
              url:      url,
              status:   response.status,
              duration: duration,
              data:     data,
            });
          } catch (hookErr) { console.error('[FluentHttp] onResponse hook error:', hookErr); }
        }

        // Debug log (enhanced with request ID and response size)
        var responseSize = typeof JSON.stringify === 'function' ? JSON.stringify(data).length : 0;
        client._debugger.requestSuccess(this.#method, url, response.status, duration, data, headers, this.#payload, requestId, responseSize);

        // Store in cache
        if (this.#method === 'GET' && this.#cacheTtl > 0) {
          client._cache.set(cacheKey, { data: data, status: response.status }, this.#cacheTtl);
        }

        // History
        if (client._history) {
          client._history.push({ method: this.#method, url: url, status: response.status, duration: duration, timestamp: Date.now() });
          if (client._historyMax > 0 && client._history.length > client._historyMax) {
            client._history.shift();
          }
        }

        // ── Protocol processing ─────────────────────────────────────
        var protocolResult = null;
        if (client._protocolEnabled && ResponseProtocol.isProtocolResponse(data)) {
          var protocolOpts = this.#noProtocolFlash ? { autoFlash: false } : {};
          protocolResult = ResponseProtocol.process(data, client, protocolOpts);
          data = protocolResult.data;
          this.#protocolFlashShown = protocolResult.flashShown || false;
        }

        // Success handlers — wrapped so user callback errors don't fall into
        // the catch block and get misinterpreted as request failures.
        try {
          this.#handleSuccess(data, response, duration);
        } catch (cbErr) {
          console.error('[FluentHttp] Callback error in success handler:', cbErr);
        }

        return { data: data, error: null, status: response.status };

      } catch (error) {
        duration = Date.now() - startTime;
        var formatted = formatError(error);

        // Debug log (enhanced with request ID)
        client._debugger.requestError(this.#method, url, formatted.status, duration, formatted.message, headers, this.#payload, requestId);

        // Post-response hook (errors too, backward compat) — protected
        if (client._onResponseHook) {
          try {
            client._onResponseHook({
              method:   this.#method,
              url:      url,
              status:   formatted.status,
              duration: duration,
              error:    formatted,
            });
          } catch (hookErr) { console.error('[FluentHttp] onResponse hook error:', hookErr); }
        }

        // History
        if (client._history) {
          client._history.push({ method: this.#method, url: url, status: formatted.status, duration: duration, timestamp: Date.now(), error: true });
          if (client._historyMax > 0 && client._history.length > client._historyMax) {
            client._history.shift();
          }
        }

        // Cancelled detection
        var isCancelled = typeof axios.isCancel === 'function' && axios.isCancel(error);
        if (isCancelled) {
          this.#events.emit('error:cancelled', { error: formatted });
          client._events.emit('error:cancelled', { error: formatted });
        }

        // Timeout detection
        if (error.code === 'ECONNABORTED') {
          this.#events.emit('error:timeout', { error: formatted });
          client._events.emit('error:timeout', { error: formatted });
        }

        // ── 401 Token Refresh ────────────────────────────────────────
        if (formatted.status === 401 && client._onUnauthorized && attempt === 0) {
          try {
            await client._onUnauthorized(formatted);
            return this.#fireRequest(url, cacheKey, attempt + 1);
          } catch (_) {
            // Refresh failed — fall through to normal error handling
          }
        }

        // ── 419 CSRF Token Mismatch (auto-refresh) ──────────────────
        if (formatted.status === 419 && attempt === 0) {
          this.#events.emit('error:csrf', { error: formatted });
          client._events.emit('error:csrf', { error: formatted });
          // Re-read CSRF token from meta tag
          var freshCsrf = detectCsrf();
          if (freshCsrf) {
            client._csrfToken = freshCsrf;
          }
          // Also invoke custom handler if provided
          if (client._onCsrfMismatch) {
            try { await client._onCsrfMismatch(formatted); } catch (_) { /* ignore */ }
          }
          // Retry once with refreshed token
          if (client._csrfToken) {
            return this.#fireRequest(url, cacheKey, attempt + 1);
          }
        }

        // ── Retry Logic ─────────────────────────────────────────────
        var isClientError = formatted.status >= 400 && formatted.status < 500;

        if (
          this.#retryAttempts > 0 &&
          attempt < this.#retryAttempts &&
          !isClientError &&
          !isCancelled
        ) {
          var delay = this.#retryExponential
            ? this.#retryDelay * Math.pow(2, attempt)
            : this.#retryDelay;

          // Emit retry event
          var retryPayload = { attempt: attempt + 1, maxAttempts: this.#retryAttempts, delay: delay, error: formatted };
          this.#events.emit('retry', retryPayload);
          client._events.emit('retry', retryPayload);

          await sleep(delay);
          return this.#fireRequest(url, cacheKey, attempt + 1);
        }

        // ── Protocol processing (error responses may have flash/sections) ──
        if (client._protocolEnabled && error.response && error.response.data) {
          var errData = error.response.data;
          if (ResponseProtocol.isProtocolResponse(errData)) {
            var errProtocolOpts = this.#noProtocolFlash ? { autoFlash: false } : {};
            var errProtocolResult = ResponseProtocol.process(errData, client, errProtocolOpts);
            this.#protocolFlashShown = errProtocolResult.flashShown || false;
          }
        }

        // ── Error handlers — wrapped so user callback errors don't
        // become unhandled rejections.
        try {
          this.#handleError(formatted, duration);
        } catch (cbErr) {
          console.error('[FluentHttp] Callback error in error handler:', cbErr);
        }

        return { data: null, error: formatted, status: formatted.status };
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FormHandler
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Binds a `<form>` element for AJAX submission.
   * Intercepts submit, serializes fields, sends via FluentHttpAjaxify,
   * and displays 422 validation errors on form fields.
   *
   * Supports Bootstrap 5 (`is-invalid` / `.invalid-feedback`) and Tailwind CSS
   * error class conventions. Compatible with `proengsoft/laravel-jsvalidation`.
   *
   * @private
   */
  class FormHandler {
    /** @type {FluentHttpAjaxify} */ #client;
    /** @type {HTMLFormElement} */        #form;
    /** @type {Object} */                #opts;

    /**
     * @param {FluentHttpAjaxify} client
     * @param {string|HTMLFormElement} selector
     * @param {Object} [options={}]
     */
    constructor(client, selector, options) {
      this.#client = client;

      var form = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;

      if (!form || form.tagName !== 'FORM') {
        client._debugger.warn('bindForm: element not found or not a <form>: ' + selector);
        return;
      }

      // Read data-fluent-* attributes from the form element as defaults
      var dataOpts = {};
      if (form.getAttribute('data-fluent-action'))          dataOpts.action = form.getAttribute('data-fluent-action');
      if (form.getAttribute('data-fluent-method'))          dataOpts.method = form.getAttribute('data-fluent-method');
      if (form.getAttribute('data-fluent-confirm'))         dataOpts.confirm = form.getAttribute('data-fluent-confirm');
      if (form.getAttribute('data-fluent-success-message')) dataOpts.successMessage = form.getAttribute('data-fluent-success-message');
      if (form.getAttribute('data-fluent-error-class'))     dataOpts.errorClass = form.getAttribute('data-fluent-error-class');
      if (form.getAttribute('data-fluent-error-tag'))       dataOpts.errorTag = form.getAttribute('data-fluent-error-tag');
      if (form.getAttribute('data-fluent-loading-class'))   dataOpts.loadingClass = form.getAttribute('data-fluent-loading-class');
      if (form.hasAttribute('data-fluent-reset'))           dataOpts.resetOnSuccess = true;
      if (form.hasAttribute('data-fluent-scroll-errors'))   dataOpts.scrollToErrors = true;

      // 2.1: Auto-detect CSS framework when no explicit errorClass/errorTag provided
      var frameworkDefaults = {};
      if (!dataOpts.errorClass && !(options && options.errorClass)) {
        var detected = detectCssFramework('auto');
        frameworkDefaults.errorClass = detected.errorClass;
        frameworkDefaults.errorTag = '.' + detected.messageClass.split(' ')[0];
        frameworkDefaults._messageClass = detected.messageClass;
        frameworkDefaults._messageTag = detected.messageTag;
      }

      this.#opts = safeAssign({
        action:            null,
        method:            'POST',
        onSuccess:         null,
        onError:           null,
        onValidationError: null,
        onBeforeSubmit:    null,
        resetOnSuccess:    false,
        disableOnSubmit:   true,
        errorClass:        'is-invalid',
        errorTag:          '.invalid-feedback',
        successMessage:    null,
        confirm:           null,
        loadingClass:      null,
        scrollToErrors:    false,
        progressTarget:    null,
        _messageClass:     'invalid-feedback',
        _messageTag:       'div',
      }, frameworkDefaults, dataOpts, options || {});

      this.#form = form;
      this.#attach();
    }

    /** @private */
    #attach() {
      var self = this;
      this.#form.addEventListener('submit', function (e) {
        e.preventDefault();
        self.#handleSubmit();
      });

      // Clear field errors on input
      this.#form.addEventListener('input', function (e) {
        var el = e.target;
        if (el && el.name) {
          self.#clearFieldError(el.name);
        }
      });
    }

    /** @private */
    async #handleSubmit() {
      var opts = this.#opts;
      var form = this.#form;

      // onBeforeSubmit hook — return false to cancel
      if (opts.onBeforeSubmit) {
        try {
          var beforeResult = opts.onBeforeSubmit(form);
          if (beforeResult === false) return;
          if (beforeResult && typeof beforeResult.then === 'function') {
            var asyncResult = await beforeResult;
            if (asyncResult === false) return;
          }
        } catch (e) {
          console.error('[FluentHttp] FormHandler onBeforeSubmit error:', e);
          return;
        }
      }

      // Confirm dialog
      if (opts.confirm) {
        var confirmed = false;
        if (typeof root.Swal !== 'undefined') {
          var result = await root.Swal.fire({
            title: opts.confirm,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes',
          });
          confirmed = result.isConfirmed;
        } else {
          confirmed = window.confirm(opts.confirm);
        }
        if (!confirmed) return;
      }

      // If laravel-jsvalidation is loaded, run client-side validation first
      if (typeof root.jQuery !== 'undefined' && typeof root.jQuery.fn.valid === 'function') {
        var $form = root.jQuery(form);
        if ($form.data('validator') && !$form.valid()) return;
      }

      // Clear previous errors
      this.#clearAllErrors();

      // Serialize form
      var hasFiles = form.querySelector('input[type="file"]') !== null;
      var body;
      if (hasFiles) {
        body = new FormData(form);
      } else {
        body = {};
        var formData = new FormData(form);
        formData.forEach(function (value, key) {
          // Support array fields (name="tags[]")
          if (key.endsWith('[]')) {
            var cleanKey = key.slice(0, -2);
            if (!body[cleanKey]) body[cleanKey] = [];
            body[cleanKey].push(value);
          } else {
            body[key] = value;
          }
        });
      }

      // Disable submit button + apply loading class
      var submitBtn = form.querySelector('[type="submit"]');
      if (opts.disableOnSubmit && submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('data-fluent-loading', 'true');
      }
      if (opts.loadingClass) {
        form.classList.add(opts.loadingClass);
      }

      // Determine action and method
      var action = opts.action || form.getAttribute('action') || form.getAttribute('data-fluent-action') || '';
      var method = (opts.method || form.getAttribute('method') || form.getAttribute('data-fluent-method') || 'POST').toUpperCase();

      // Build and send request
      var builder;
      switch (method) {
        case 'GET':    builder = this.#client.get(action).withParams(typeof body === 'object' && !(body instanceof FormData) ? body : {}); break;
        case 'PUT':    builder = this.#client.put(action, body); break;
        case 'PATCH':  builder = this.#client.patch(action, body); break;
        case 'DELETE': builder = this.#client.delete(action, body); break;
        default:       builder = this.#client.post(action, body); break;
      }

      // 2.5: Wire up file upload progress if form has files and a progress target
      if (hasFiles && opts.progressTarget) {
        var progressEl = typeof opts.progressTarget === 'string' ? document.querySelector(opts.progressTarget) : opts.progressTarget;
        if (progressEl) {
          builder.onProgress(function (pct) {
            if (progressEl.tagName === 'PROGRESS' || progressEl.hasAttribute('role') && progressEl.getAttribute('role') === 'progressbar') {
              progressEl.value = pct;
              progressEl.setAttribute('aria-valuenow', pct);
            } else {
              progressEl.style.width = pct + '%';
              progressEl.textContent = pct + '%';
            }
          });
        }
      }

      var sendResult = await builder.send();

      // Re-enable submit button + remove loading class
      if (opts.disableOnSubmit && submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('data-fluent-loading');
      }
      if (opts.loadingClass) {
        form.classList.remove(opts.loadingClass);
      }

      if (sendResult.error) {
        // 422 — display validation errors on fields
        if (sendResult.status === 422 && sendResult.error.errors) {
          this.#displayErrors(sendResult.error.errors);
          // Scroll to first error
          if (opts.scrollToErrors) {
            var firstInvalid = form.querySelector('.' + opts.errorClass);
            if (firstInvalid && typeof firstInvalid.scrollIntoView === 'function') {
              firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          // Dedicated validation error callback
          if (opts.onValidationError) {
            try { opts.onValidationError(sendResult.error.errors, sendResult.error); } catch (e) { console.error('[FluentHttp] FormHandler onValidationError callback error:', e); }
          }
        }
        if (opts.onError) { try { opts.onError(sendResult.error); } catch (e) { console.error('[FluentHttp] FormHandler onError callback error:', e); } }
      } else {
        if (opts.resetOnSuccess) form.reset();
        if (opts.successMessage && this.#client._notifier) {
          this.#client._notifier.success(opts.successMessage);
        }
        if (opts.onSuccess) { try { opts.onSuccess(sendResult.data); } catch (e) { console.error('[FluentHttp] FormHandler onSuccess callback error:', e); } }
      }
    }

    /**
     * Display validation errors on form fields.
     * @param {Object<string, string[]>} errors  `{ field: ['msg'] }` format (e.g. Laravel, ASP.NET)
     * @private
     */
    #displayErrors(errors) {
      var opts = this.#opts;
      var form = this.#form;
      var fields = Object.keys(errors);

      for (var i = 0; i < fields.length; i++) {
        var name  = fields[i];
        var msgs  = errors[name];
        // 2.3: Multi-level dot-notation (e.g. "items.0.name" → "items[0][name]")
        var inputName = name.replace(/\.([^.]+)/g, '[$1]');
        var input = form.querySelector('[name="' + inputName + '"]') ||
                    form.querySelector('[name="' + name + '"]');

        if (input) {
          input.classList.add(opts.errorClass);

          // 2.4: Set ARIA attributes for accessibility
          input.setAttribute('aria-invalid', 'true');

          // Find or create feedback element
          var feedback = input.parentNode.querySelector(opts.errorTag);

          // 2.2: Create error element when it doesn't exist
          if (!feedback) {
            var tag = opts._messageTag || 'div';
            feedback = document.createElement(tag);
            var classes = (opts._messageClass || 'invalid-feedback').split(' ');
            for (var ci = 0; ci < classes.length; ci++) {
              if (classes[ci]) feedback.classList.add(classes[ci]);
            }
            feedback.setAttribute('data-fluent-created', 'true');
            input.parentNode.insertBefore(feedback, input.nextSibling);
          }

          var msgText = Array.isArray(msgs) ? msgs[0] : msgs;
          feedback.textContent = msgText;
          feedback.style.display = 'block';

          // 2.4: ARIA — link input to error element
          feedback.setAttribute('role', 'alert');
          var feedbackId = feedback.id || ('fluent-err-' + inputName.replace(/[\[\]]/g, '-'));
          feedback.id = feedbackId;
          input.setAttribute('aria-describedby', feedbackId);
        }
      }
    }

    /**
     * Clear error state from a specific field.
     * @param {string} name
     * @private
     */
    #clearFieldError(name) {
      var opts  = this.#opts;
      var form  = this.#form;
      // 2.3: Also try dot-to-bracket converted name
      var bracketName = name.replace(/\.([^.]+)/g, '[$1]');
      var input = form.querySelector('[name="' + name + '"]') ||
                  form.querySelector('[name="' + bracketName + '"]');
      if (input) {
        input.classList.remove(opts.errorClass);

        // 2.4: Remove ARIA attributes
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');

        var feedback = input.parentNode.querySelector(opts.errorTag);
        if (feedback) {
          feedback.textContent = '';
          feedback.style.display = '';
        }

        // Remove dynamically created error elements
        var created = input.parentNode.querySelector('[data-fluent-created]');
        if (created) {
          created.parentNode.removeChild(created);
        }
      }
    }

    /**
     * Clear all error states from the form.
     * @private
     */
    #clearAllErrors() {
      var opts = this.#opts;
      var form = this.#form;
      var invalids = form.querySelectorAll('.' + opts.errorClass);
      for (var i = 0; i < invalids.length; i++) {
        invalids[i].classList.remove(opts.errorClass);
        // 2.4: Remove ARIA attributes
        invalids[i].removeAttribute('aria-invalid');
        invalids[i].removeAttribute('aria-describedby');
      }
      var feedbacks = form.querySelectorAll(opts.errorTag);
      for (var j = 0; j < feedbacks.length; j++) {
        feedbacks[j].textContent = '';
        feedbacks[j].style.display = '';
      }
      // Remove dynamically created error elements
      var created = form.querySelectorAll('[data-fluent-created]');
      for (var k = 0; k < created.length; k++) {
        created[k].parentNode.removeChild(created[k]);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ResponseProtocol
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Client-side processor for the standardised JSON response protocol.
   *
   * Expected server envelope:
   * ```json
   * {
   *   "success": true,
   *   "message": "Operation succeeded",
   *   "data":    { ... },
   *   "errors":  {},
   *   "redirect": "/dashboard",
   *   "flash":    [{ "type": "success", "message": "Saved!" }],
   *   "sections": { "#user-list": "<ul>...</ul>" },
   *   "scrollTo": "#user-list",
   *   "dump":     { "debug_key": "value" },
   *   "runJavascript": "console.log('hello')"
   * }
   * ```
   *
   * Security:
   * - `redirect` validated with `sanitizeUrl()`
   * - `sections` HTML sanitized via `sanitizeHtml()` (configurable mode)
   * - `runJavascript` blocked by default unless `allowServerEval` is true
   * - `flash` messages escaped before DOM insertion
   *
   * @private
   */
  class ResponseProtocol {

    /**
     * Check if a response body looks like a protocol envelope.
     * @param {*} data
     * @returns {boolean}
     */
    static isProtocolResponse(data) {
      if (!data || typeof data !== 'object') return false;
      return typeof data.success === 'boolean' || data.redirect !== undefined || data.flash !== undefined || data.sections !== undefined;
    }

    /**
     * Process a protocol response, executing all supported directives.
     *
     * @param {Object} data        The response payload
     * @param {Object} client      The FluentHttpAjaxify instance
     * @param {Object} [opts={}]   Override protocol options for this call
     * @returns {{ handled: boolean, data: Object }}
     */
    static process(data, client, opts) {
      if (!ResponseProtocol.isProtocolResponse(data)) return { handled: false, data: data, flashShown: false };

      var cfg = safeAssign({}, client._protocolOpts, opts || {});

      var events = client._events;
      var flashShown = false;

      // ── Flash messages → notifier ──────────────────────────────────
      if (cfg.autoFlash !== false && data.flash && Array.isArray(data.flash) && client._notifier) {
        events.emit('protocol:flash', data.flash);
        for (var fi = 0; fi < data.flash.length; fi++) {
          var f = data.flash[fi];
          if (f && f.type && f.message) {
            var fn = client._notifier[f.type];
            if (typeof fn === 'function') {
              fn.call(client._notifier, f.message, f.title || undefined);
              flashShown = true;
            }
          }
        }
      }

      // ── Alert → toast or fallback to window.alert ──────────────────
      if (cfg.autoAlert !== false && data.alert && typeof data.alert === 'string') {
        events.emit('protocol:alert', data.alert);
        if (client._notifier && typeof client._notifier.info === 'function') {
          client._notifier.info(data.alert);
        } else if (isBrowser()) {
          window.alert(data.alert);
        }
      }

      // ── Sections → DOM update (with per-section or top-level drawMode) ─
      if (cfg.autoSections !== false && data.sections && typeof data.sections === 'object' && isBrowser()) {
        events.emit('protocol:section', data.sections);
        var sectionKeys = Object.keys(data.sections);
        var sanitizeMode = client._sectionSanitize || 'basic';
        var topDrawMode = data.drawMode || 'redraw';
        for (var si = 0; si < sectionKeys.length; si++) {
          var selector = sectionKeys[si];
          var sectionValue = data.sections[selector];
          // Validate selector (basic check — must start with # or .)
          if (typeof selector !== 'string' || !/^[#.\w\-[\]=":, >+~]+$/.test(selector)) continue;

          // Support both flat string (legacy) and {html, mode} object (per-section drawMode)
          var html, drawMode;
          if (sectionValue && typeof sectionValue === 'object' && typeof sectionValue.html === 'string') {
            html = sectionValue.html;
            drawMode = sectionValue.mode || topDrawMode;
          } else if (typeof sectionValue === 'string') {
            html = sectionValue;
            drawMode = topDrawMode;
          } else {
            continue;
          }

          var target = document.querySelector(selector);
          if (target) {
            var sanitized = sanitizeHtml(html, sanitizeMode);
            if (drawMode === 'append') {
              target.insertAdjacentHTML('beforeend', sanitized);
            } else if (drawMode === 'prepend') {
              target.insertAdjacentHTML('afterbegin', sanitized);
            } else {
              target.innerHTML = sanitized;
            }
          }
        }
      }

      // ── scrollTo ───────────────────────────────────────────────────
      if (cfg.autoScrollTo !== false && data.scrollTo && typeof data.scrollTo === 'string' && isBrowser()) {
        events.emit('protocol:scrollTo', data.scrollTo);
        try {
          var scrollTarget = document.querySelector(data.scrollTo);
          if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } catch (_) { /* invalid selector — ignore */ }
      }

      // ── dump → console (debug only) ────────────────────────────────
      if (cfg.autoDump !== false && data.dump !== undefined) {
        events.emit('protocol:dump', data.dump);
        if (client._debugger && client._debugger.isActive()) {
          client._debugger.info('Server dump:');
          console.log(data.dump);
        }
      }

      // ── confirm → confirmation prompt ─────────────────────────────
      if (data.confirm && typeof data.confirm === 'string' && isBrowser()) {
        events.emit('protocol:confirm', data.confirm);
        if (typeof root.Swal !== 'undefined') {
          root.Swal.fire({
            title: data.confirm,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes',
          });
        } else {
          window.confirm(data.confirm);
        }
      }

      // ── closeModal → dispatch custom event ─────────────────────────
      if (data.closeModal && isBrowser()) {
        events.emit('protocol:closeModal', data.closeModal);
        try {
          document.dispatchEvent(new CustomEvent('fluent:close-modal', { detail: data.closeModal }));
        } catch (_) {}
      }

      // ── resetForm → dispatch custom event ──────────────────────────
      if (data.resetForm && isBrowser()) {
        events.emit('protocol:resetForm', data.resetForm);
        try {
          document.dispatchEvent(new CustomEvent('fluent:reset-form', { detail: data.resetForm }));
        } catch (_) {}
      }

      // ── emit → dispatch custom DOM events ──────────────────────────
      if (data.emit && typeof data.emit === 'object' && isBrowser()) {
        events.emit('protocol:emit', data.emit);
        var emitKeys = Object.keys(data.emit);
        var safeEventPattern = /^[a-zA-Z0-9._:\-]+$/;
        for (var ei = 0; ei < emitKeys.length; ei++) {
          // Validate event name to prevent injection
          if (!safeEventPattern.test(emitKeys[ei])) continue;
          try {
            document.dispatchEvent(new CustomEvent('fluent:' + emitKeys[ei], { detail: data.emit[emitKeys[ei]] }));
          } catch (_) {}
        }
      }

      // ── runJavascript → new Function() (guarded) ───────────────────
      if (data.runJavascript && typeof data.runJavascript === 'string') {
        events.emit('protocol:script', data.runJavascript);
        if (client._allowServerEval) {
          try {
            (new Function(data.runJavascript))();
          } catch (jsErr) {
            if (client._debugger) client._debugger.warn('runJavascript error: ' + jsErr.message);
          }
        } else {
          if (client._debugger) client._debugger.warn('runJavascript blocked (allowServerEval=false): ' + data.runJavascript.substring(0, 50));
        }
      }

      // ── redirect (last — navigates away) ───────────────────────────
      if (cfg.autoRedirect !== false && data.redirect && typeof data.redirect === 'string' && isBrowser()) {
        events.emit('protocol:redirect', data.redirect);
        try {
          var safeRedirectUrl = sanitizeUrl(data.redirect);
          window.location.href = safeRedirectUrl;
        } catch (redirErr) {
          if (client._debugger) client._debugger.warn('Blocked redirect to unsafe URL: ' + data.redirect.substring(0, 30));
        }
      }

      return { handled: true, data: data.data !== undefined ? data.data : data, flashShown: flashShown };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FluentHttpAjaxify
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Fluent, chainable HTTP client built on Axios.
   *
   * Create instances via constructor or static factory:
   * ```js
   * // Constructor — pass a config object
   * const api = new FluentHttpAjaxify({
   *   baseURL: '/api',
   *   debug: true,
   *   concurrency: 4,
   * });
   *
   * // Static factory — convenience shorthand
   * const api = FluentHttpAjaxify.create('/api', { debug: true });
   * ```
   *
   * All requests return a consistent `{ data, error, status }` shape and
   * **never throw**, making error handling predictable across your entire app.
   *
   * Default values are defined in `_REGISTRATION.config` and can be
   * overridden per-instance via the constructor config object.
   */
  class FluentHttpAjaxify {

    // ── Internal State ──────────────────────────────────────────────────────
    // Prefixed with `_` because RequestBuilder (inside this IIFE) needs
    // cross-class access. These are NOT part of the public API.

    /** @type {string} */               _baseURL           = '';
    /** @type {string} */               _csrfToken         = '';
    /** @type {string} */               _csrfHeaderName    = 'X-CSRF-TOKEN';
    /** @type {?string} */              _csrfCookieName    = null;
    /** @type {string} */               _globalToken       = '';
    /** @type {string} */               _globalTokenScheme = 'Bearer';
    /** @type {number} */               _timeout           = 10000;
    /** @type {Object<string,string>} */ _defaultHeaders   = {};
    /** @type {?function} */            _globalOnSuccess   = null;
    /** @type {?function} */            _globalOnError     = null;
    /** @type {?function} */            _onUnauthorized    = null;
    /** @type {?function} */            _onCsrfMismatch    = null;
    /** @type {?function} */            _onRequestHook     = null;
    /** @type {?function} */            _onResponseHook    = null;
    /** @type {FluentDebugger} */       _debugger          = new FluentDebugger();
    /** @type {CacheStore} */           _cache             = new CacheStore();
    /** @type {DedupStore} */           _dedup             = new DedupStore();
    /** @type {?ConcurrencyQueue} */    _concurrencyQueue  = null;
    /** @type {?OfflineQueue} */        _offlineQueue      = null;
    /** @type {?Object} */              _mockRoutes        = null;
    /** @type {EventEmitter} */         _events            = new EventEmitter();
    /** @type {MiddlewareStack} */     _middleware         = new MiddlewareStack();
    /** @type {Object} */               _notifier          = ConsoleNotifier;
    /** @type {string} */               _notifierName      = 'console';
    /** @type {?Object} */              _autoNotify        = null;
    /** @type {?Array} */               _history           = null;
    /** @type {number} */               _historyMax        = 0;
    /** @type {Array<FormHandler>} */   _boundForms        = [];

    // ── Security State ────────────────────────────────────────────────────
    /** @type {boolean} */              _requireHttps      = false;
    /** @type {?string[]} */            _allowedOrigins    = null;
    /** @type {number} */               _maxRequestBodySize = 0;
    /** @type {number} */               _maxResponseSize   = 0;
    /** @type {string} */               _sectionSanitize   = 'basic';
    /** @type {boolean} */              _allowServerEval   = false;
    /** @type {string[]} */             _sensitiveHeaders  = SENSITIVE_HEADERS;

    // ── Protocol State ────────────────────────────────────────────────────
    /** @type {boolean} */              _protocolEnabled   = false;
    /** @type {Object} */               _protocolOpts      = {};

    // ── Constructor ────────────────────────────────────────────────────────

    /**
     * Create a new `FluentHttpAjaxify` instance.
     *
     * Config values are merged with defaults from `_REGISTRATION.config`.
     * Any property not provided falls back to the registration default.
     *
     * @constructor
     * @param {Object} [config={}]
     * @param {string}  [config.baseURL='']          Base URL prepended to all endpoints
     * @param {string}  [config.csrf]                CSRF token (auto-detected from `<meta>` tag if omitted)
     * @param {string}  [config.token]               Global Bearer token
     * @param {string}  [config.tokenScheme='Bearer'] Authorization scheme
     * @param {number}  [config.timeout=10000]       Default request timeout in ms
     * @param {Object}  [config.defaultHeaders={}]   Headers merged into every request
     * @param {boolean|string} [config.debug=false]   Debug level: true/'info'/'verbose'/'warn'/'error'/false
     * @param {boolean} [config.offline=false]        Enable offline request queueing
     * @param {number}  [config.concurrency]          Max simultaneous in-flight requests
     * @param {number}  [config.history]              Max history entries (0 = disabled)
     * @param {Object}  [config.smart]                Smart auto-init overrides
     *
     * @example
     * const api = new FluentHttpAjaxify({
     *   baseURL: '/api',
     *   token: localStorage.getItem('auth_token'),
     *   timeout: 5000,
     *   debug: true,
     *   concurrency: 4,
     *   history: 50,
     * });
     */
    constructor(config) {
      config = config || {};
      var httpDefaults     = _REGISTRATION.config.http;
      var featureDefaults  = _REGISTRATION.config.features;
      var securityDefaults = _REGISTRATION.config.security;
      var protocolDefaults = _REGISTRATION.config.protocol;

      this._baseURL           = (config.baseURL != null ? config.baseURL : httpDefaults.baseURL).replace(/\/+$/, '');
      this._csrfHeaderName    = config.csrfHeaderName || httpDefaults.csrfHeaderName || 'X-CSRF-TOKEN';
      this._csrfCookieName    = config.csrfCookieName || httpDefaults.csrfCookieName || null;
      this._csrfToken         = config.csrf != null ? config.csrf : (httpDefaults.csrf != null ? httpDefaults.csrf : detectCsrf());
      this._globalToken       = config.token || '';
      this._globalTokenScheme = config.tokenScheme || httpDefaults.tokenScheme;
      this._timeout           = config.timeout != null ? config.timeout : httpDefaults.timeout;

      // Debug: accepts boolean or log level string
      var debugLevel = config.debug != null ? config.debug : featureDefaults.debug;
      this._debugger = new FluentDebugger(debugLevel === true ? 'info' : (debugLevel === false ? 'silent' : (debugLevel || 'silent')));

      // Console-only default notifier; load FluentToast.js for rich toasts
      this._notifier = ConsoleNotifier;
      this._notifierName = 'console';

      // BUG FIX: shallow-copy defaultHeaders to avoid shared reference
      var srcHeaders = config.defaultHeaders || httpDefaults.defaultHeaders || {};
      this._defaultHeaders = {};
      var hKeys = Object.keys(srcHeaders);
      for (var i = 0; i < hKeys.length; i++) {
        this._defaultHeaders[hKeys[i]] = srcHeaders[hKeys[i]];
      }

      this._cache  = new CacheStore();
      this._dedup  = new DedupStore();
      this._events = new EventEmitter();

      var offlineEnabled = config.offline != null ? config.offline : featureDefaults.offline;
      this._offlineQueue = offlineEnabled ? new OfflineQueue() : null;

      var concurrency = config.concurrency != null ? config.concurrency : featureDefaults.concurrency;
      this._concurrencyQueue = (concurrency && concurrency > 0) ? new ConcurrencyQueue(concurrency) : null;

      // History
      var historyMax = config.history != null ? config.history : featureDefaults.history;
      if (historyMax && historyMax > 0) {
        this._history    = [];
        this._historyMax = historyMax;
      }

      // Security config
      var sec = config.security || {};
      this._requireHttps       = sec.requireHttps != null ? sec.requireHttps : securityDefaults.requireHttps;
      this._allowedOrigins     = sec.allowedOrigins || securityDefaults.allowedOrigins || null;
      this._maxRequestBodySize = sec.maxRequestBodySize != null ? sec.maxRequestBodySize : securityDefaults.maxRequestBodySize;
      this._maxResponseSize    = sec.maxResponseSize != null ? sec.maxResponseSize : securityDefaults.maxResponseSize;
      this._sectionSanitize    = sec.sectionSanitize || securityDefaults.sectionSanitize || 'basic';
      this._allowServerEval    = sec.allowServerEval != null ? sec.allowServerEval : securityDefaults.allowServerEval;
      this._sensitiveHeaders   = sec.sensitiveHeaders || securityDefaults.sensitiveHeaders || SENSITIVE_HEADERS;

      // Protocol config
      var proto = config.protocol;
      if (proto === true) {
        this._protocolEnabled = true;
        this._protocolOpts = safeAssign({}, protocolDefaults, { enabled: true });
      } else if (proto && typeof proto === 'object') {
        this._protocolEnabled = proto.enabled !== false;
        this._protocolOpts = safeAssign({}, protocolDefaults, proto);
      }
    }

    // ── Factory ─────────────────────────────────────────────────────────────

    /**
     * Static factory — convenience alias for `new FluentHttpAjaxify(config)`.
     *
     * @param {string} [baseURL='']  Base URL prepended to all endpoints
     * @param {Object} [options={}]  Config options (same shape as constructor)
     * @returns {FluentHttpAjaxify}
     *
     * @example
     * const api = FluentHttpAjaxify.create('/api', {
     *   timeout: 5000,
     *   debug: true,
     *   concurrency: 4,
     * });
     */
    static create(baseURL, options) {
      var config = {};
      var opts = options || {};
      var keys = Object.keys(opts);
      for (var i = 0; i < keys.length; i++) {
        config[keys[i]] = opts[keys[i]];
      }
      if (baseURL != null) config.baseURL = baseURL;
      return new FluentHttpAjaxify(config);
    }

    // ── Global Configuration (chainable) ────────────────────────────────

    /**
     * Set the CSRF token globally for all requests from this instance.
     *
     * @param {string} token
     * @returns {FluentHttpAjaxify}
     */
    withCsrf(token) {
      if (token != null && token !== '') {
        this._csrfToken = token;
      }
      return this;
    }

    /**
     * Enable double-submit cookie CSRF pattern.
     * Reads the CSRF token from the named cookie and sends it as `X-XSRF-TOKEN`.
     *
     * @param {string} [cookieName='XSRF-TOKEN']
     * @returns {FluentHttpAjaxify}
     */
    withCsrfCookie(cookieName) {
      this._csrfCookieName = cookieName || 'XSRF-TOKEN';
      // Also read the cookie value into the token if we don't have one yet
      if (!this._csrfToken) {
        this._csrfToken = readCsrfCookie(this._csrfCookieName);
      }
      return this;
    }

    /**
     * Set the CSRF header name (default: `X-CSRF-TOKEN`).
     * Useful for backends that expect a different header name (e.g. `X-XSRF-TOKEN`).
     *
     * @param {string} name
     * @returns {FluentHttpAjaxify}
     */
    withCsrfHeader(name) {
      if (name && typeof name === 'string') {
        this._csrfHeaderName = name;
      }
      return this;
    }

    /**
     * Global 419 (CSRF Token Mismatch) handler.
     * Called when a 419 is received. After it resolves, the CSRF token is
     * re-read from `<meta>` tags and the request is retried once.
     *
     * @param {function(Object): Promise<void>} fn
     * @returns {FluentHttpAjaxify}
     */
    onCsrfMismatch(fn) {
      this._onCsrfMismatch = fn;
      return this;
    }

    /**
     * Set the Bearer (or custom scheme) token globally for all requests.
     *
     * @param {string} token
     * @param {string} [scheme='Bearer']
     * @returns {FluentHttpAjaxify}
     */
    withToken(token, scheme) {
      if (token != null && token !== '') {
        this._globalToken       = token;
        this._globalTokenScheme = scheme || 'Bearer';
      }
      return this;
    }

    /**
     * Merge default headers for all requests from this instance.
     *
     * @param {Object<string,string>} headers
     * @returns {FluentHttpAjaxify}
     */
    withDefaultHeaders(headers) {
      if (headers && typeof headers === 'object') {
        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) {
          this._defaultHeaders[keys[i]] = headers[keys[i]];
        }
      }
      return this;
    }

    /**
     * Set max concurrent in-flight requests.
     * Pass `0` or `null` to remove the limit.
     *
     * @param {number} n
     * @returns {FluentHttpAjaxify}
     */
    withConcurrency(n) {
      this._concurrencyQueue = (n && n > 0) ? new ConcurrencyQueue(n) : null;
      return this;
    }

    /**
     * Set the debug log level.
     *
     * @param {boolean|string} [level=true]  `true` → 'info', `false` → 'silent', or a level string: 'silent'|'error'|'warn'|'info'|'verbose'
     * @returns {FluentHttpAjaxify}
     */
    debug(level) {
      this._debugger.setLevel(level !== undefined ? level : true);
      return this;
    }

    /**
     * Print a structured snapshot of the instance state to the console.
     * Works regardless of the current debug level.
     *
     * @returns {FluentHttpAjaxify}
     */
    dump() {
      this._debugger.dump(this);
      return this;
    }

    /**
     * Backward-compatible getter — returns true if debugger is active.
     * @returns {boolean}
     */
    get _debug() {
      return this._debugger && this._debugger.isActive();
    }

    // ── Global Hooks (chainable) ────────────────────────────────────────

    /**
     * Global success callback — fires on **every** successful response.
     *
     * @param {function(*, Object): void} fn  Receives `(data, axiosResponse)`
     * @returns {FluentHttpAjaxify}
     */
    onSuccess(fn) {
      this._globalOnSuccess = fn;
      return this;
    }

    /**
     * Global error callback — fires on **every** failed response.
     *
     * @param {function(Object): void} fn  Receives the formatted error object
     * @returns {FluentHttpAjaxify}
     */
    onError(fn) {
      this._globalOnError = fn;
      return this;
    }

    /**
     * Global 401 handler for automatic token refresh.
     *
     * When a 401 is received, `fn` is called with the formatted error.
     * If it resolves (e.g. after refreshing the token and calling `.withToken()`),
     * the original request is **replayed once** automatically.
     *
     * @param {function(Object): Promise<void>} fn
     * @returns {FluentHttpAjaxify}
     *
     * @example
     * api.onUnauthorized(async (err) => {
     *   const { token } = await refreshToken();
     *   api.withToken(token);
     * });
     */
    onUnauthorized(fn) {
      this._onUnauthorized = fn;
      return this;
    }

    /**
     * Hook called **before** every request (for external logging / telemetry).
     *
     * @param {function({ method: string, url: string, params: Object, headers: Object, body: * }): void} fn
     * @returns {FluentHttpAjaxify}
     */
    onRequest(fn) {
      this._onRequestHook = fn;
      return this;
    }

    /**
     * Hook called **after** every response or error (for external logging / telemetry).
     *
     * @param {function({ method: string, url: string, status: number, duration: number, data?: *, error?: Object }): void} fn
     * @returns {FluentHttpAjaxify}
     */
    onResponse(fn) {
      this._onResponseHook = fn;
      return this;
    }

    // ── Mock Mode ───────────────────────────────────────────────────────

    /**
     * Enable mock mode for testing without a real server.
     *
     * Route keys can be plain endpoints (`'/users'`) or method-prefixed
     * (`'GET:/users'`, `'POST:/login'`). Values can be static data or
     * functions `(params, body) => data`.
     *
     * Pass `null` or an empty object to disable mock mode.
     *
     * @param {?Object<string, *|function>} routeMap
     * @returns {FluentHttpAjaxify}
     *
     * @example
     * api.mock({
     *   '/users':      [{ id: 1, name: 'Imani' }],
     *   'POST:/login': (params, body) => ({ token: 'abc123' }),
     * });
     */
    mock(routeMap) {
      this._mockRoutes = (routeMap && Object.keys(routeMap).length > 0) ? routeMap : null;
      return this;
    }

    // ── Cache Control ───────────────────────────────────────────────────

    /**
     * Clear all cached responses.
     * @returns {FluentHttpAjaxify}
     */
    clearCache() {
      this._cache.clear();
      return this;
    }

    // ── Request Methods ─────────────────────────────────────────────────

    /**
     * Start a **GET** request builder.
     *
     * @param {string} endpoint   URL path (appended to baseURL)
     * @param {Object} [params]   Query parameters
     * @returns {RequestBuilder}
     */
    get(endpoint, params) {
      var builder = new RequestBuilder(this, 'GET', endpoint);
      if (params) builder.withParams(params);
      return builder;
    }

    /**
     * Start a **POST** request builder.
     *
     * @param {string} endpoint
     * @param {*} [data]  Request body
     * @returns {RequestBuilder}
     */
    post(endpoint, data) {
      return new RequestBuilder(this, 'POST', endpoint, data);
    }

    /**
     * Start a **PUT** request builder.
     *
     * @param {string} endpoint
     * @param {*} [data]  Request body
     * @returns {RequestBuilder}
     */
    put(endpoint, data) {
      return new RequestBuilder(this, 'PUT', endpoint, data);
    }

    /**
     * Start a **PATCH** request builder.
     *
     * @param {string} endpoint
     * @param {*} [data]  Request body
     * @returns {RequestBuilder}
     */
    patch(endpoint, data) {
      return new RequestBuilder(this, 'PATCH', endpoint, data);
    }

    /**
     * Start a **DELETE** request builder.
     *
     * @param {string} endpoint
     * @param {*} [data]  Optional request body (for batch deletes, etc.)
     * @returns {RequestBuilder}
     */
    delete(endpoint, data) {
      return new RequestBuilder(this, 'DELETE', endpoint, data);
    }

    /**
     * Start a file upload (POST with FormData).
     *
     * For finer control, prefer `.post(endpoint).withFile(name, file)`.
     *
     * @param {string} endpoint
     * @param {FormData} formData
     * @returns {RequestBuilder}
     */
    upload(endpoint, formData) {
      return new RequestBuilder(this, 'POST', endpoint, formData);
    }

    /**
     * Start a **HEAD** request builder.
     *
     * @param {string} endpoint
     * @param {Object} [params]
     * @returns {RequestBuilder}
     */
    head(endpoint, params) {
      var builder = new RequestBuilder(this, 'HEAD', endpoint);
      if (params) builder.withParams(params);
      return builder;
    }

    /**
     * Start an **OPTIONS** request builder.
     *
     * @param {string} endpoint
     * @returns {RequestBuilder}
     */
    options(endpoint) {
      return new RequestBuilder(this, 'OPTIONS', endpoint);
    }

    // ── Batch ─────────────────────────────────────────────────────────────

    /**
     * Execute multiple request builders in parallel.
     * Returns an array of results in the same order as the input builders.
     *
     * @param {RequestBuilder[]} builders  Array of unsent RequestBuilder instances
     * @returns {Promise<Array<{ data: *|null, error: Object|null, status: number }>>}
     *
     * @example
     * const [users, posts] = await api.batch([
     *   api.get('/users'),
     *   api.get('/posts'),
     * ]);
     */
    async batch(builders) {
      if (!Array.isArray(builders)) throw new TypeError('[FluentHttp] batch() requires an array of RequestBuilder instances');
      return Promise.all(builders.map(function (b) { return b.send(); }));
    }

    // ── Event Emitter (instance-level) ───────────────────────────────────

    /**
     * Register an instance-level event listener.
     * Fires for ALL requests from this instance.
     *
     * @param {string} event  Event name (e.g. `'success'`, `'error:422'`, `'start'`, `'complete'`)
     * @param {function} fn
     * @returns {FluentHttpAjaxify}
     */
    on(event, fn) {
      this._events.on(event, fn);
      return this;
    }

    /**
     * Register a one-shot instance-level event listener.
     *
     * @param {string} event
     * @param {function} fn
     * @returns {FluentHttpAjaxify}
     */
    once(event, fn) {
      this._events.once(event, fn);
      return this;
    }

    /**
     * Remove an instance-level event listener.
     * If `fn` is omitted, removes ALL listeners for that event.
     *
     * @param {string} event
     * @param {function} [fn]
     * @returns {FluentHttpAjaxify}
     */
    off(event, fn) {
      this._events.off(event, fn);
      return this;
    }

    /**
     * Manually emit an event on this instance.
     *
     * @param {string} event
     * @param {*} [payload]
     * @returns {FluentHttpAjaxify}
     */
    emit(event, payload) {
      this._events.emit(event, payload);
      return this;
    }

    // ── Notification ─────────────────────────────────────────────────────

    /**
     * Set the notification adapter for this instance.
     *
     * @param {string|Object} driver  Library name (`'toastr'`, `'sweetalert2'`, `'notyf'`, `'izitoast'`, `'auto'`, `'console'`)
     *                                or a custom `{ success, error, warning, info }` adapter object.
     * @returns {FluentHttpAjaxify}
     *
     * @example
     * api.useNotifier('auto');          // auto-detect loaded library
     * api.useNotifier('toastr');        // explicitly use toastr
     * api.useNotifier({                 // custom adapter
     *   success: (msg) => myToast(msg, 'success'),
     *   error:   (msg) => myToast(msg, 'error'),
     *   warning: (msg) => myToast(msg, 'warning'),
     *   info:    (msg) => myToast(msg, 'info'),
     * });
     */
    useNotifier(driver) {
      this._notifier = NotificationAdapter.create(driver);
      this._notifierName = typeof driver === 'string' ? driver : 'custom adapter';
      return this;
    }

    /**
     * Get the instance-level middleware stack.
     * Push middleware here to apply to ALL requests made by this instance.
     *
     * @returns {MiddlewareStack}
     *
     * @example
     * api.getMiddleware().push(Middleware.logging(), 'logging');
     * api.getMiddleware().push(Middleware.retry({ attempts: 3 }), 'retry');
     */
    getMiddleware() {
      return this._middleware;
    }

    /**
     * Configure global auto-notification behavior.
     *
     * @param {Object} opts
     * @param {boolean|string} [opts.success=false]      Toast on every success (true or custom message)
     * @param {boolean|string} [opts.error=true]         Toast on every error
     * @param {boolean|string} [opts.validation=true]    Toast summary on 422
     * @param {boolean|string} [opts.networkError]       Toast on network errors
     * @returns {FluentHttpAjaxify}
     */
    autoNotify(opts) {
      this._autoNotify = opts || null;
      return this;
    }

    /**
     * Replace the global success handler. The original handler is available via
     * `FluentHttpAjaxify._originalSuccessHandler` for extending.
     *
     * @param {function} fn  Custom success handler: `fn(data, response, duration)`
     * @returns {FluentHttpAjaxify}
     */
    setSuccessHandler(fn) {
      if (typeof fn === 'function') {
        this._customSuccessHandler = fn;
      }
      return this;
    }

    /**
     * Replace the global error handler. The original handler is available via
     * `FluentHttpAjaxify._originalErrorHandler` for extending.
     *
     * @param {function} fn  Custom error handler: `fn(formatted, duration)`
     * @returns {FluentHttpAjaxify}
     */
    setErrorHandler(fn) {
      if (typeof fn === 'function') {
        this._customErrorHandler = fn;
      }
      return this;
    }

    // ── Form Binding ─────────────────────────────────────────────────────

    /**
     * Bind a form element for AJAX submission with automatic 422 error display.
     *
     * @param {string|HTMLFormElement} selector  CSS selector or form element
     * @param {Object} [options={}]
     * @param {string}  [options.action]           Override form action URL
     * @param {string}  [options.method='POST']    Override form method
     * @param {function} [options.onSuccess]        Success callback
     * @param {function} [options.onError]          Error callback
     * @param {boolean} [options.resetOnSuccess=false]  Reset form after success
     * @param {boolean} [options.disableOnSubmit=true]  Disable submit button while loading
     * @param {string}  [options.errorClass='is-invalid']  CSS class for invalid fields
     * @param {string}  [options.errorTag='.invalid-feedback']  Selector for error message element
     * @param {string}  [options.successMessage]    Auto-toast on success
     * @param {string}  [options.confirm]           Confirm dialog before submit
     * @returns {FluentHttpAjaxify}
     */
    bindForm(selector, options) {
      var handler = new FormHandler(this, selector, options);
      this._boundForms.push(handler);
      return this;
    }

    // ── History ──────────────────────────────────────────────────────────

    /**
     * Get the request history log.
     * Returns an empty array if history is disabled.
     *
     * @returns {Array<{ method: string, url: string, status: number, duration: number, timestamp: number, error?: boolean }>}
     */
    getHistory() {
      return this._history ? this._history.slice() : [];
    }

    /**
     * Clear the request history log.
     * @returns {FluentHttpAjaxify}
     */
    clearHistory() {
      if (this._history) this._history.length = 0;
      return this;
    }

    // ── Static Utilities ────────────────────────────────────────────────

    /**
     * Format an Axios error into a structured `{ status, message, errors, raw }` object.
     *
     * @param {Error} error
     * @returns {{ status: number, message: string, errors: Object, raw: Error }}
     */
    static formatError(error) {
      return formatError(error);
    }

    /**
     * Check if the browser is currently online.
     * Always returns `true` in non-browser environments.
     *
     * @returns {boolean}
     */
    static isOnline() {
      return isOnline();
    }

    /**
     * Get the module registration object (config defaults, metadata, messages).
     *
     * @returns {Object} The full `_REGISTRATION` object
     */
    static getRegistration() {
      return _REGISTRATION;
    }

    /**
     * Deferred callback queue — runs `fn(api)` after auto-init completes.
     * If auto-init has already run, `fn` fires immediately.
     *
     * @param {function(FluentHttpAjaxify): void} fn
     *
     * @example
     * FluentHttpAjaxify.ready(function (api) {
     *   api.get('/users').send();
     * });
     */
    static ready(fn) {
      if (typeof fn !== 'function') return;
      if (FluentHttpAjaxify._autoInstance) {
        fn(FluentHttpAjaxify._autoInstance);
      } else {
        FluentHttpAjaxify._readyQueue.push(fn);
      }
    }
  }

  // Static properties for auto-init
  FluentHttpAjaxify._autoInstance = null;
  FluentHttpAjaxify._readyQueue  = [];

  // Expose middleware system as statics
  FluentHttpAjaxify.Middleware      = Object.freeze(Middleware);
  FluentHttpAjaxify.MiddlewareStack = MiddlewareStack;

  // Expose security utilities as statics
  FluentHttpAjaxify.escapeHtml          = escapeHtml;
  FluentHttpAjaxify.sanitizeUrl         = sanitizeUrl;
  FluentHttpAjaxify.sanitizeHtml        = sanitizeHtml;
  FluentHttpAjaxify.safeAssign          = safeAssign;
  FluentHttpAjaxify.sanitizeFieldName   = sanitizeFieldName;
  FluentHttpAjaxify.extractSingleError  = extractSingleError;
  FluentHttpAjaxify.detectCssFramework  = detectCssFramework;
  FluentHttpAjaxify.ResponseProtocol    = ResponseProtocol;

  // Freeze the registration object to prevent runtime tampering
  Object.freeze(_REGISTRATION.metadata);
  Object.freeze(_REGISTRATION.messages);
  Object.freeze(_REGISTRATION.messages.info);
  Object.freeze(_REGISTRATION.messages.error);

  // ══════════════════════════════════════════════════════════════════════════
  // Smart Auto-Init
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * On DOMContentLoaded:
   * 1. Read <meta> tags for config (csrf, baseURL, token, debug)
   * 2. Auto-create a global instance if <meta name="api-base-url"> is present
   * 3. Auto-bind forms with data-fluent-action attribute
   * 4. Flush the ready queue
   *
   * On window.load:
   * 5. Auto-detect notification library
   *
   * All smart behaviors are controlled by `_REGISTRATION.config.smart` and
   * can be disabled by setting them to false before the script loads, or by
   * not including the relevant <meta> tags.
   */
  (function autoInit() {
    var smart = _REGISTRATION.config.smart;

    // ── DOMContentLoaded ──────────────────────────────────────────────
    domReady(function () {
      if (!smart.autoInit) return;

      var prefix  = smart.metaPrefix || '';
      var baseURL = readMeta('api-base-url', prefix);

      // Only auto-init if the page declares a base URL
      if (!baseURL) return;

      var csrf  = readMeta('csrf-token', prefix) || detectCsrf();
      var token = readMeta('api-token', prefix);
      var debug = readMeta('fluent-debug', prefix);

      var instance = new FluentHttpAjaxify({
        baseURL: baseURL,
        csrf:    csrf || undefined,
        token:   token || undefined,
        debug:   debug === 'true' || debug === '1',
      });

      // Expose as global
      var globalName = smart.globalName || 'FluentHttp';
      root[globalName] = instance;
      FluentHttpAjaxify._autoInstance = instance;

      // Auto-bind forms with data-fluent-action attribute
      if (smart.autoBindForms) {
        var forms = document.querySelectorAll('form[data-fluent-action]');
        for (var i = 0; i < forms.length; i++) {
          instance.bindForm(forms[i]);
        }
      }

      // ── Delegated auto-binding (laravel-ajax parity) ─────────────
      // form.ajax — forms with class="ajax" auto-submit via AJAX
      document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        if (!form.classList.contains('ajax') && !form.hasAttribute('data-fluent')) return;
        e.preventDefault();
        var action = form.getAttribute('action') || form.getAttribute('data-fluent-action') || '';
        var method = (form.getAttribute('method') || form.getAttribute('data-fluent-method') || 'POST').toUpperCase();
        // Auto-bind on first submit if not already bound
        if (!form._fluentBound) {
          form._fluentBound = true;
          instance.bindForm(form, { action: action, method: method });
        }
        // Trigger the FormHandler's submit
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }, true);

      // a.ajax — links with class="ajax" send GET via AJAX
      document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('a.ajax, a[data-fluent-get]') : null;
        if (!el) return;
        e.preventDefault();
        var url = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-fluent-get') || '';
        if (!url) return;
        instance.get(url).send().then(function (result) {
          if (result.error && instance._notifier) {
            instance._notifier.error(result.error.message || 'Request failed');
          }
        });
      });

      // button.ajax — buttons with class="ajax" and data-url
      document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('button.ajax, button[data-fluent-post], button[data-fluent-delete]') : null;
        if (!el || el.tagName !== 'BUTTON') return;
        if (el.type === 'submit' && el.form) return; // Let form handler deal with it
        e.preventDefault();
        var url = el.getAttribute('data-url') || el.getAttribute('data-fluent-post') || el.getAttribute('data-fluent-delete') || '';
        if (!url) return;
        var method = el.getAttribute('data-method') || (el.hasAttribute('data-fluent-delete') ? 'DELETE' : 'POST');
        var confirm = el.getAttribute('data-fluent-confirm') || el.getAttribute('data-confirm') || null;

        function doRequest() {
          el.disabled = true;
          var builder;
          switch (method.toUpperCase()) {
            case 'DELETE': builder = instance.delete(url); break;
            case 'PUT':    builder = instance.put(url); break;
            case 'PATCH':  builder = instance.patch(url); break;
            default:       builder = instance.post(url); break;
          }
          builder.send().then(function (result) {
            el.disabled = false;
            if (result.error && instance._notifier) {
              instance._notifier.error(result.error.message || 'Request failed');
            }
          });
        }

        if (confirm) {
          if (typeof root.Swal !== 'undefined') {
            root.Swal.fire({ title: confirm, icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes' }).then(function (r) {
              if (r.isConfirmed) doRequest();
            });
          } else {
            if (window.confirm(confirm)) doRequest();
          }
        } else {
          doRequest();
        }
      });

      // ── Submit button tracking ───────────────────────────────────
      document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[type="submit"], input[type="submit"]') : null;
        if (btn && btn.form) {
          btn.form.setAttribute('data-submitted-by', btn.name || btn.value || '');
        }
      });

      // Flush ready queue
      var queue = FluentHttpAjaxify._readyQueue;
      FluentHttpAjaxify._readyQueue = [];
      for (var j = 0; j < queue.length; j++) {
        queue[j](instance);
      }

      // Debug log
      instance._debugger.info(_REGISTRATION.messages.info.autoInit);
    });

    // ── window.load ───────────────────────────────────────────────────
    // Notification adapter auto-detection is now handled by FluentToast.js
    // (if loaded). FluentToast auto-bridges to the global instance on window.load.
  })();

  return FluentHttpAjaxify;
});
