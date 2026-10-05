/**
 * FluentHttpAjaxify v2.1.1
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
        csrf:           null
      },
      features: {
        debug:       false,
        offline:     false,
        concurrency: 0,
        history:     0
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
      version:      '2.1.1',
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
        pending[i]();
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
   * Auto-detect CSRF token from `<meta name="csrf-token">` in the document.
   * Returns empty string in non-browser environments or if the meta tag is absent.
   *
   * @returns {string}
   * @private
   */
  function detectCsrf(prefix) {
    if (!isBrowser()) return '';
    var name = (prefix || '') + 'csrf-token';
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? (el.getAttribute('content') || '') : '';
  }

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

  /**
   * Probe `window` for known notification libraries.
   * Returns the name of the first detected library, or `'console'`.
   *
   * @returns {string}
   * @private
   */
  function detectNotifierName() {
    if (!isBrowser()) return 'console';
    if (typeof root.toastr !== 'undefined')   return 'toastr';
    if (typeof root.Swal !== 'undefined')     return 'sweetalert2';
    if (typeof root.Notyf !== 'undefined')    return 'notyf';
    if (typeof root.iziToast !== 'undefined') return 'izitoast';
    return 'console';
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
  // NotificationAdapter
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Pluggable notification adapter.
   * Wraps popular toast libraries (Toastr, SweetAlert2, Notyf, iziToast)
   * behind a uniform `{ success, error, warning, info }` interface.
   *
   * @private
   */
  var NotificationAdapter = {

    /**
     * Build an adapter object from a library name or custom handler.
     *
     * @param {string|Object} driver  Library name or custom `{ success, error, warning, info }` object
     * @returns {{ success: function, error: function, warning: function, info: function }}
     */
    create: function (driver) {
      if (driver && typeof driver === 'object' && typeof driver.success === 'function') {
        return driver; // custom adapter
      }
      var name = (typeof driver === 'string') ? driver : 'console';
      if (name === 'builtin') return FluentToast;
      if (name === 'auto') {
        var detected = detectNotifierName();
        return (detected !== 'console') ? NotificationAdapter.create(detected) : FluentToast;
      }

      switch (name) {
        case 'toastr':
          return {
            success: function (msg, title) { root.toastr.success(msg, title); },
            error:   function (msg, title) { root.toastr.error(msg, title); },
            warning: function (msg, title) { root.toastr.warning(msg, title); },
            info:    function (msg, title) { root.toastr.info(msg, title); },
          };
        case 'sweetalert2':
          return {
            success: function (msg, title) { root.Swal.fire({ icon: 'success', title: title || 'Success', text: msg, toast: true, position: 'top-end', timer: 3000, showConfirmButton: false }); },
            error:   function (msg, title) { root.Swal.fire({ icon: 'error',   title: title || 'Error',   text: msg, toast: true, position: 'top-end', timer: 5000, showConfirmButton: false }); },
            warning: function (msg, title) { root.Swal.fire({ icon: 'warning', title: title || 'Warning', text: msg, toast: true, position: 'top-end', timer: 4000, showConfirmButton: false }); },
            info:    function (msg, title) { root.Swal.fire({ icon: 'info',    title: title || 'Info',    text: msg, toast: true, position: 'top-end', timer: 3000, showConfirmButton: false }); },
          };
        case 'notyf':
          return (function () {
            var notyf = new root.Notyf({ duration: 3000, position: { x: 'right', y: 'top' } });
            return {
              success: function (msg) { notyf.success(msg); },
              error:   function (msg) { notyf.error(msg); },
              warning: function (msg) { notyf.open({ type: 'warning', message: msg }); },
              info:    function (msg) { notyf.open({ type: 'info', message: msg }); },
            };
          })();
        case 'izitoast':
          return {
            success: function (msg, title) { root.iziToast.success({ title: title || 'Success', message: msg }); },
            error:   function (msg, title) { root.iziToast.error({ title: title || 'Error', message: msg }); },
            warning: function (msg, title) { root.iziToast.warning({ title: title || 'Warning', message: msg }); },
            info:    function (msg, title) { root.iziToast.info({ title: title || 'Info', message: msg }); },
          };
        default: // console
          return {
            success: function (msg, title) { console.log('[SUCCESS]', title || '', msg); },
            error:   function (msg, title) { console.error('[ERROR]', title || '', msg); },
            warning: function (msg, title) { console.warn('[WARNING]', title || '', msg); },
            info:    function (msg, title) { console.info('[INFO]', title || '', msg); },
          };
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // FluentToast — Built-in zero-dependency toast notifications
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Self-contained toast notification system.
   * Injects its own CSS into `<head>` on first use — no external stylesheet needed.
   * Supports success/error/warning/info with auto-dismiss, stacking, dark mode,
   * slide-in animation, and manual close.
   *
   * No-op in non-browser environments (Node.js).
   *
   * @private
   */
  var FluentToast = (function () {

    var STYLE_ID     = 'fluent-toast-styles';
    var CONTAINER_ID = 'fluent-toast-container';
    var Z_INDEX      = 2147483000;
    var _injected    = false;

    var ICONS = {
      success: '\u2713', // ✓
      error:   '\u2715', // ✕
      warning: '\u26A0', // ⚠
      info:    '\u2139', // ℹ
    };

    var DURATIONS = {
      success: 4000,
      error:   6000,
      warning: 6000,
      info:    4000,
    };

    var COLORS_LIGHT = {
      success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '#10b981' },
      error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '#ef4444' },
      warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '#f59e0b' },
      info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: '#3b82f6' },
    };

    var COLORS_DARK = {
      success: { bg: '#064e3b', border: '#10b981', text: '#d1fae5', icon: '#34d399' },
      error:   { bg: '#7f1d1d', border: '#ef4444', text: '#fee2e2', icon: '#f87171' },
      warning: { bg: '#78350f', border: '#f59e0b', text: '#fef3c7', icon: '#fbbf24' },
      info:    { bg: '#1e3a5f', border: '#3b82f6', text: '#dbeafe', icon: '#60a5fa' },
    };

    function injectCSS() {
      if (_injected || !isBrowser()) return;
      _injected = true;

      var css = ''
        + '#' + CONTAINER_ID + '{'
        + '  position:fixed;top:16px;right:16px;z-index:' + Z_INDEX + ';'
        + '  display:flex;flex-direction:column;gap:8px;pointer-events:none;'
        + '  max-width:380px;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;'
        + '}'
        + '.fluent-toast{'
        + '  display:flex;align-items:flex-start;gap:10px;padding:12px 16px;'
        + '  border-radius:8px;border-left:4px solid;box-shadow:0 4px 12px rgba(0,0,0,.15);'
        + '  pointer-events:auto;cursor:pointer;opacity:0;transform:translateX(100%);'
        + '  animation:fluentToastIn .3s ease forwards;'
        + '  font-size:14px;line-height:1.4;max-width:100%;word-break:break-word;'
        + '}'
        + '.fluent-toast.fluent-toast-out{'
        + '  animation:fluentToastOut .25s ease forwards;'
        + '}'
        + '.fluent-toast-icon{font-size:18px;flex-shrink:0;line-height:1;margin-top:1px;}'
        + '.fluent-toast-body{flex:1;}'
        + '.fluent-toast-title{font-weight:600;margin-bottom:2px;}'
        + '.fluent-toast-msg{opacity:.85;}'
        + '.fluent-toast-close{'
        + '  background:none;border:none;font-size:16px;cursor:pointer;opacity:.5;'
        + '  padding:0 0 0 8px;line-height:1;flex-shrink:0;color:inherit;'
        + '}'
        + '.fluent-toast-close:hover{opacity:1;}'
        + '@keyframes fluentToastIn{to{opacity:1;transform:translateX(0);}}'
        + '@keyframes fluentToastOut{to{opacity:0;transform:translateX(100%);}}'
        // Dark mode overrides via CSS custom properties
        + '@media(prefers-color-scheme:dark){'
        + '  .fluent-toast{box-shadow:0 4px 12px rgba(0,0,0,.4);}'
        + '}';

      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }

    function getContainer() {
      if (!isBrowser()) return null;
      var el = document.getElementById(CONTAINER_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = CONTAINER_ID;
        document.body.appendChild(el);
      }
      return el;
    }

    function isDarkMode() {
      return isBrowser() && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function show(type, msg, title) {
      if (!isBrowser()) return;
      injectCSS();

      var container = getContainer();
      if (!container) return;

      var colors = isDarkMode() ? COLORS_DARK[type] : COLORS_LIGHT[type];
      var toast = document.createElement('div');
      toast.className = 'fluent-toast';
      toast.style.backgroundColor = colors.bg;
      toast.style.borderColor = colors.border;
      toast.style.color = colors.text;

      var iconSpan = '<span class="fluent-toast-icon" style="color:' + colors.icon + '">' + ICONS[type] + '</span>';
      var bodyHtml = '<div class="fluent-toast-body">';
      if (title) bodyHtml += '<div class="fluent-toast-title">' + escapeHtml(title) + '</div>';
      bodyHtml += '<div class="fluent-toast-msg">' + escapeHtml(msg) + '</div></div>';
      var closeBtn = '<button class="fluent-toast-close" aria-label="Close">\u00D7</button>';

      toast.innerHTML = iconSpan + bodyHtml + closeBtn;

      // Close on click
      var dismiss = function () {
        toast.classList.add('fluent-toast-out');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 260);
      };
      toast.querySelector('.fluent-toast-close').addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss();
      });
      toast.addEventListener('click', dismiss);

      // Insert at top (newest first)
      container.insertBefore(toast, container.firstChild);

      // Auto-dismiss
      var duration = DURATIONS[type] || 4000;
      setTimeout(function () {
        if (toast.parentNode) dismiss();
      }, duration);
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str);
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Public API — matches NotificationAdapter interface
    return {
      success: function (msg, title) { show('success', msg, title); },
      error:   function (msg, title) { show('error', msg, title); },
      warning: function (msg, title) { show('warning', msg, title); },
      info:    function (msg, title) { show('info', msg, title); },
    };
  })();

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
     */
    requestSuccess(method, url, status, duration, data, headers, body) {
      if (!this.#enabled('info')) return;
      this._totalRequests++;
      this._totalDuration += duration;

      var label = '%c' + FluentDebugger.PREFIX + '%c ' + method + ' ' + url;

      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed(
          label + ' %c\u2192 ' + status + ' (' + duration + 'ms)',
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.success
        );
        if (this.#enabled('verbose')) {
          if (headers) console.log('%c\u2192 Headers:%c', FluentDebugger.STYLES.dim, '', this.#maskHeaders(headers));
          if (body !== undefined && body !== null) console.log('%c\u2192 Body:%c', FluentDebugger.STYLES.dim, '', this.#truncate(body));
        }
        if (data !== undefined) console.log('%c\u2190 Data:%c', FluentDebugger.STYLES.dim, '', this.#truncate(data));
        console.groupEnd();
      } else {
        console.log(
          label + ' %c\u2192 ' + status + ' (' + duration + 'ms)',
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
     */
    requestError(method, url, status, duration, message, headers, body) {
      if (!this.#enabled('error')) return;
      this._totalRequests++;
      this._totalErrors++;
      this._totalDuration += duration;

      var label = '%c' + FluentDebugger.PREFIX + '%c ' + method + ' ' + url;

      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed(
          label + ' %c\u2192 ERROR ' + status + ' (' + duration + 'ms)',
          FluentDebugger.STYLES.label, '', FluentDebugger.STYLES.error
        );
        if (this.#enabled('verbose')) {
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
      var notifierName = instance._notifier === FluentToast ? 'builtin (FluentToast)'
        : (instance._notifier ? 'custom adapter' : 'none');

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

    /** Mask sensitive header values (Authorization, API keys) */
    #maskHeaders(headers) {
      var masked = {};
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = headers[k];
        if (/^(authorization|x-api-key|api-key)/i.test(k) && typeof v === 'string' && v.length > 8) {
          masked[k] = v.substring(0, v.indexOf(' ') + 1) + '***' + v.slice(-4);
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
  function formatError(error) {
    if (error.response) {
      return {
        status:  error.response.status,
        message: error.response.data?.message ?? error.message,
        errors:  error.response.data?.errors ?? {},
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
      message: error.message ?? _REGISTRATION.messages.error.configError,
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

    // ── Clone ─────────────────────────────────────────────────────────────

    /**
     * Clone this builder into a new unsent copy with the same configuration.
     *
     * @returns {RequestBuilder}
     */
    clone() {
      var clonedPayload = this.#payload;
      if (clonedPayload && typeof clonedPayload === 'object' && !(typeof FormData !== 'undefined' && clonedPayload instanceof FormData)) {
        clonedPayload = Object.assign({}, clonedPayload);
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

          if (onPage) onPage(pageData, page, result.data);

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
        return await this.#doRequest();
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
          this.#handleSuccess(data, { data: data, status: 200, headers: {} }, 0);
          return mockResult;
        }
      }

      // ── Cache hit (GET only) ─────────────────────────────────────────
      if (this.#method === 'GET' && this.#cacheTtl > 0) {
        var cached = client._cache.get(key);
        if (cached !== undefined) {
          this.#handleSuccess(cached.data, cached, 0);
          return { data: cached.data, error: null, status: cached.status };
        }
      }

      // ── Deduplication (GET only) ─────────────────────────────────────
      // BUG FIX: clone the resolved result so THIS builder's callbacks fire
      if (this.#method === 'GET' && client._dedup.has(key)) {
        var self = this;
        return client._dedup.get(key).then(function (result) {
          if (result.error) {
            self.#handleError(result.error, 0);
          } else {
            self.#handleSuccess(result.data, { data: result.data, status: result.status }, 0);
          }
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

      // Per-request callbacks
      if (this.#onSuccess) this.#onSuccess(data, response);
      if (this.#onFinally) this.#onFinally();

      // Per-request events
      this.#events.emit('success', payload);
      this.#events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration });

      // Instance-level events
      client._events.emit('success', payload);
      client._events.emit('response', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration, data: data });
      client._events.emit('complete', { method: this.#method, url: client._baseURL + this.#endpoint, status: response.status, duration: duration });

      // Global callbacks (backward compat)
      if (client._globalOnSuccess) client._globalOnSuccess(data, response);

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

      // Per-request callbacks
      if (this.#onError) this.#onError(formatted);
      if (this.#onFinally) this.#onFinally();

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

      // Global callbacks (backward compat)
      if (client._globalOnError) client._globalOnError(formatted);

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

      if (type === 'success') {
        if (opts && typeof opts === 'object' && opts.success) msg = opts.success;
        else if (opts === true) msg = 'Request successful';
        else if (auto && auto.success) msg = typeof auto.success === 'string' ? auto.success : 'Request successful';
        if (msg) notifier.success(msg);
      } else if (type === 'error') {
        // Per-request opts always take priority over global auto-notify
        if (opts && typeof opts === 'object' && opts.error) msg = opts.error;
        else if (opts === true) msg = payload.message || 'Request failed';

        if (msg) {
          // Per-request message wins — show it regardless of status code
          notifier.error(msg);
        } else if (payload.status === 422 && auto && auto.validation) {
          var valMsg = typeof auto.validation === 'string' ? auto.validation : (payload.message || 'Validation failed');
          notifier.warning(valMsg);
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

      // ── Method Override ───────────────────────────────────────────────
      if (this.#methodOverride && method !== 'GET' && method !== 'POST') {
        if (isForm) {
          // Clone FormData to avoid mutating the original on retry
          var clonedFd = new FormData();
          payload.forEach(function (v, k) { clonedFd.append(k, v); });
          clonedFd.append('_method', method);
          payload = clonedFd;
        } else if (payload && typeof payload === 'object') {
          payload = Object.assign({}, payload, { _method: method });
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

      if (client._csrfToken) {
        headers['X-CSRF-TOKEN'] = client._csrfToken;
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

      // Pre-request hook (backward compat)
      if (client._onRequestHook) {
        client._onRequestHook({
          method:  this.#method,
          url:     url,
          params:  this.#params,
          headers: headers,
          body:    payload,
        });
      }

      // ── Fire ─────────────────────────────────────────────────────────
      try {
        var response = await axios(config);
        duration = Date.now() - startTime;
        var data     = response.data;

        // Post-response hook (backward compat)
        if (client._onResponseHook) {
          client._onResponseHook({
            method:   this.#method,
            url:      url,
            status:   response.status,
            duration: duration,
            data:     data,
          });
        }

        // Debug log
        client._debugger.requestSuccess(this.#method, url, response.status, duration, data, headers, this.#payload);

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

        // Debug log
        client._debugger.requestError(this.#method, url, formatted.status, duration, formatted.message, headers, this.#payload);

        // Post-response hook (errors too, backward compat)
        if (client._onResponseHook) {
          client._onResponseHook({
            method:   this.#method,
            url:      url,
            status:   formatted.status,
            duration: duration,
            error:    formatted,
          });
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
      this.#opts   = Object.assign({
        action:          null,
        method:          'POST',
        onSuccess:       null,
        onError:         null,
        resetOnSuccess:  false,
        disableOnSubmit: true,
        errorClass:      'is-invalid',
        errorTag:        '.invalid-feedback',
        successMessage:  null,
        confirm:         null,
      }, options || {});

      var form = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;

      if (!form || form.tagName !== 'FORM') {
        client._debugger.warn('bindForm: element not found or not a <form>: ' + selector);
        return;
      }

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

      // Disable submit button
      var submitBtn = form.querySelector('[type="submit"]');
      if (opts.disableOnSubmit && submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('data-fluent-loading', 'true');
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

      var result = await builder.send();

      // Re-enable submit button
      if (opts.disableOnSubmit && submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('data-fluent-loading');
      }

      if (result.error) {
        // 422 — display validation errors on fields
        if (result.status === 422 && result.error.errors) {
          this.#displayErrors(result.error.errors);
        }
        if (opts.onError) opts.onError(result.error);
      } else {
        if (opts.resetOnSuccess) form.reset();
        if (opts.successMessage && this.#client._notifier) {
          this.#client._notifier.success(opts.successMessage);
        }
        if (opts.onSuccess) opts.onSuccess(result.data);
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
        // Support dot-notation (e.g. "address.city" → "address[city]")
        var inputName = name.replace(/\.(\w+)/g, '[$1]');
        var input = form.querySelector('[name="' + inputName + '"]') ||
                    form.querySelector('[name="' + name + '"]');

        if (input) {
          input.classList.add(opts.errorClass);

          // Find or create feedback element
          var feedback = input.parentNode.querySelector(opts.errorTag);
          if (feedback) {
            feedback.textContent = Array.isArray(msgs) ? msgs[0] : msgs;
            feedback.style.display = 'block';
          }
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
      var input = form.querySelector('[name="' + name + '"]');
      if (input) {
        input.classList.remove(opts.errorClass);
        var feedback = input.parentNode.querySelector(opts.errorTag);
        if (feedback) {
          feedback.textContent = '';
          feedback.style.display = '';
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
      }
      var feedbacks = form.querySelectorAll(opts.errorTag);
      for (var j = 0; j < feedbacks.length; j++) {
        feedbacks[j].textContent = '';
        feedbacks[j].style.display = '';
      }
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
    /** @type {string} */               _globalToken       = '';
    /** @type {string} */               _globalTokenScheme = 'Bearer';
    /** @type {number} */               _timeout           = 10000;
    /** @type {Object<string,string>} */ _defaultHeaders   = {};
    /** @type {?function} */            _globalOnSuccess   = null;
    /** @type {?function} */            _globalOnError     = null;
    /** @type {?function} */            _onUnauthorized    = null;
    /** @type {?function} */            _onRequestHook     = null;
    /** @type {?function} */            _onResponseHook    = null;
    /** @type {FluentDebugger} */       _debugger          = new FluentDebugger();
    /** @type {CacheStore} */           _cache             = new CacheStore();
    /** @type {DedupStore} */           _dedup             = new DedupStore();
    /** @type {?ConcurrencyQueue} */    _concurrencyQueue  = null;
    /** @type {?OfflineQueue} */        _offlineQueue      = null;
    /** @type {?Object} */              _mockRoutes        = null;
    /** @type {EventEmitter} */         _events            = new EventEmitter();
    /** @type {Object} */               _notifier          = FluentToast;
    /** @type {?Object} */              _autoNotify        = null;
    /** @type {?Array} */               _history           = null;
    /** @type {number} */               _historyMax        = 0;
    /** @type {Array<FormHandler>} */   _boundForms        = [];

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
      var httpDefaults    = _REGISTRATION.config.http;
      var featureDefaults = _REGISTRATION.config.features;

      this._baseURL           = (config.baseURL != null ? config.baseURL : httpDefaults.baseURL).replace(/\/+$/, '');
      this._csrfToken         = config.csrf != null ? config.csrf : (httpDefaults.csrf != null ? httpDefaults.csrf : detectCsrf());
      this._globalToken       = config.token || '';
      this._globalTokenScheme = config.tokenScheme || httpDefaults.tokenScheme;
      this._timeout           = config.timeout != null ? config.timeout : httpDefaults.timeout;

      // Debug: accepts boolean or log level string
      var debugLevel = config.debug != null ? config.debug : featureDefaults.debug;
      this._debugger = new FluentDebugger(debugLevel === true ? 'info' : (debugLevel === false ? 'silent' : (debugLevel || 'silent')));

      // Built-in toast is always the default notifier
      this._notifier = FluentToast;

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
      return this;
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

      // Auto-bind forms
      if (smart.autoBindForms) {
        var forms = document.querySelectorAll('form[data-fluent-action]');
        for (var i = 0; i < forms.length; i++) {
          var form = forms[i];
          instance.bindForm(form, {
            action:         form.getAttribute('data-fluent-action'),
            method:         form.getAttribute('data-fluent-method') || 'POST',
            resetOnSuccess: form.getAttribute('data-fluent-reset') === 'true',
            successMessage: form.getAttribute('data-fluent-success') || null,
            confirm:        form.getAttribute('data-fluent-confirm') || null,
            errorClass:     form.getAttribute('data-fluent-error-class') || 'is-invalid',
            errorTag:       form.getAttribute('data-fluent-error-tag') || '.invalid-feedback',
          });
        }
      }

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
    windowReady(function () {
      if (!smart.autoInit || !smart.autoNotifier) return;
      var instance = FluentHttpAjaxify._autoInstance;
      if (!instance) return;

      // Auto-detect and set notification adapter
      var detectedName = detectNotifierName();
      if (detectedName !== 'console') {
        instance.useNotifier(detectedName);
        instance._debugger.info(_REGISTRATION.messages.info.notifierSet.replace('%s', detectedName));
      }
    });
  })();

  return FluentHttpAjaxify;
});
