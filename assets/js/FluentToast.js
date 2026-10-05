/**
 * FluentToast v3.0.0
 * ────────────────────────────────────────────────────────────────────────────
 * Standalone, zero-dependency toast notification system.
 * Extracted from FluentHttpAjaxify for separation of concerns.
 *
 * Features:
 * - 6-position system (top-right, top-left, top-center, bottom-right, bottom-left, bottom-center)
 * - Dark mode auto-detection
 * - Configurable durations, max toasts, pause-on-hover, progress bar
 * - Bridge pattern for FluentHttpAjaxify event integration
 * - Pluggable notification adapter (Toastr, SweetAlert2, Notyf, iziToast)
 *
 * UMD module: works via <script> tag, ESM import, or CommonJS require().
 *
 * @license MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FluentToast = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Global root reference ─────────────────────────────────────────────────
  var root = (typeof self !== 'undefined') ? self
           : (typeof globalThis !== 'undefined') ? globalThis
           : (typeof global !== 'undefined') ? global
           : {};

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * @returns {boolean}
   * @private
   */
  function isBrowser() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  /**
   * Sanitize a string for safe HTML insertion.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  // NotificationAdapter
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Pluggable notification adapter.
   * Wraps popular toast libraries (Toastr, SweetAlert2, Notyf, iziToast)
   * behind a uniform `{ success, error, warning, info }` interface.
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

  var STYLE_ID     = 'fluent-toast-styles';
  var CONTAINER_PREFIX = 'fluent-toast-container';
  var Z_INDEX      = 2147483000;
  var _injected    = false;

  var ICONS = {
    success: '\u2713', // ✓
    error:   '\u2715', // ✕
    warning: '\u26A0', // ⚠
    info:    '\u2139', // ℹ
  };

  var DEFAULT_DURATIONS = {
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

  // ── Position system ───────────────────────────────────────────────────────

  /**
   * Position-to-CSS mapping for the 6 supported positions.
   * @private
   */
  var POSITION_STYLES = {
    'top-right':     { top: '16px', right: '16px', bottom: 'auto', left: 'auto', flexDir: 'column',         slideIn: 'translateX(100%)',  slideOut: 'translateX(100%)' },
    'top-left':      { top: '16px', right: 'auto', bottom: 'auto', left: '16px', flexDir: 'column',         slideIn: 'translateX(-100%)', slideOut: 'translateX(-100%)' },
    'top-center':    { top: '16px', right: 'auto', bottom: 'auto', left: '50%',  flexDir: 'column',         slideIn: 'translateY(-100%)', slideOut: 'translateY(-100%)', transform: 'translateX(-50%)' },
    'bottom-right':  { top: 'auto', right: '16px', bottom: '16px', left: 'auto', flexDir: 'column-reverse', slideIn: 'translateX(100%)',  slideOut: 'translateX(100%)' },
    'bottom-left':   { top: 'auto', right: 'auto', bottom: '16px', left: '16px', flexDir: 'column-reverse', slideIn: 'translateX(-100%)', slideOut: 'translateX(-100%)' },
    'bottom-center': { top: 'auto', right: 'auto', bottom: '16px', left: '50%',  flexDir: 'column-reverse', slideIn: 'translateY(100%)',  slideOut: 'translateY(100%)',  transform: 'translateX(-50%)' },
  };

  // ── Configuration ─────────────────────────────────────────────────────────

  var _config = {
    position:     'top-right',
    maxToasts:    5,
    pauseOnHover: true,
    progressBar:  false,
    duration:     Object.assign({}, DEFAULT_DURATIONS),
    newestOnTop:  true,
    nonce:        null,
    styles:       true,
    customClass:  null,
  };

  // ── CSS injection ─────────────────────────────────────────────────────────

  /**
   * Detect CSP nonce from existing script/style tags or meta tag.
   * @returns {string|null}
   */
  function detectNonce() {
    if (!isBrowser()) return null;
    // Check meta tag first
    var meta = document.querySelector('meta[name="csp-nonce"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    // Check existing script tags for nonce
    var scripts = document.querySelectorAll('script[nonce]');
    if (scripts.length > 0) return scripts[0].nonce || scripts[0].getAttribute('nonce');
    return null;
  }

  function injectCSS() {
    if (_injected || !isBrowser()) return;
    // Skip CSS injection if styles are disabled (user provides own CSS)
    if (_config.styles === false) { _injected = true; return; }
    _injected = true;

    var css = ''
      // Base container (position applied dynamically)
      + '[id^="' + CONTAINER_PREFIX + '"]{'
      + '  position:fixed;z-index:' + Z_INDEX + ';'
      + '  display:flex;gap:8px;pointer-events:none;'
      + '  max-width:380px;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;'
      + '}'
      + '.fluent-toast{'
      + '  display:flex;align-items:flex-start;gap:10px;padding:12px 16px;'
      + '  border-radius:8px;border-left:4px solid;box-shadow:0 4px 12px rgba(0,0,0,.15);'
      + '  pointer-events:auto;cursor:pointer;opacity:0;'
      + '  font-size:14px;line-height:1.4;max-width:100%;word-break:break-word;'
      + '  transition:opacity .3s ease, transform .3s ease;'
      + '}'
      + '.fluent-toast.fluent-toast-in{'
      + '  opacity:1;transform:translateX(0) translateY(0) !important;'
      + '}'
      + '.fluent-toast.fluent-toast-out{'
      + '  opacity:0;pointer-events:none;'
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
      // Progress bar
      + '.fluent-toast-progress{'
      + '  position:absolute;bottom:0;left:0;height:3px;border-radius:0 0 0 8px;'
      + '  transition:width linear;'
      + '}'
      // Dark mode overrides
      + '@media(prefers-color-scheme:dark){'
      + '  .fluent-toast{box-shadow:0 4px 12px rgba(0,0,0,.4);}'
      + '}';

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;

    // CSP nonce support: use configured nonce, or auto-detect from page
    var nonce = _config.nonce || detectNonce();
    if (nonce) {
      style.setAttribute('nonce', nonce);
    }

    document.head.appendChild(style);
  }

  function getContainer() {
    if (!isBrowser()) return null;
    var pos = _config.position;
    var containerId = CONTAINER_PREFIX + '-' + pos;
    var el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;

      var posStyle = POSITION_STYLES[pos] || POSITION_STYLES['top-right'];
      el.style.top            = posStyle.top;
      el.style.right          = posStyle.right;
      el.style.bottom         = posStyle.bottom;
      el.style.left           = posStyle.left;
      el.style.flexDirection  = posStyle.flexDir;
      if (posStyle.transform) {
        el.style.transform = posStyle.transform;
      }

      document.body.appendChild(el);
    }
    return el;
  }

  function isDarkMode() {
    return isBrowser() && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ── Enforce max toasts ────────────────────────────────────────────────────

  function enforceMaxToasts(container) {
    var toasts = container.querySelectorAll('.fluent-toast:not(.fluent-toast-out)');
    while (toasts.length >= _config.maxToasts) {
      var oldest = _config.newestOnTop ? toasts[toasts.length - 1] : toasts[0];
      dismissToast(oldest);
      toasts = container.querySelectorAll('.fluent-toast:not(.fluent-toast-out)');
    }
  }

  function dismissToast(toast) {
    if (!toast || toast.classList.contains('fluent-toast-out')) return;
    var pos = _config.position;
    var posStyle = POSITION_STYLES[pos] || POSITION_STYLES['top-right'];
    toast.classList.remove('fluent-toast-in');
    toast.classList.add('fluent-toast-out');
    toast.style.transform = posStyle.slideOut;
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 310);
  }

  // ── Show toast ────────────────────────────────────────────────────────────

  function show(type, msg, title) {
    if (!isBrowser()) return;
    injectCSS();

    var container = getContainer();
    if (!container) return;

    enforceMaxToasts(container);

    var pos = _config.position;
    var posStyle = POSITION_STYLES[pos] || POSITION_STYLES['top-right'];
    var colors = isDarkMode() ? COLORS_DARK[type] : COLORS_LIGHT[type];
    if (!colors) colors = COLORS_LIGHT.info;

    var toast = document.createElement('div');
    toast.className = 'fluent-toast' + (_config.customClass ? ' ' + _config.customClass : '');
    toast.style.backgroundColor = colors.bg;
    toast.style.borderColor = colors.border;
    toast.style.color = colors.text;
    toast.style.transform = posStyle.slideIn;
    toast.style.position = 'relative';

    // Accessibility
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    // Icon
    var iconEl = document.createElement('span');
    iconEl.className = 'fluent-toast-icon';
    iconEl.style.color = colors.icon;
    iconEl.textContent = ICONS[type];
    toast.appendChild(iconEl);

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'fluent-toast-body';
    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = 'fluent-toast-title';
      titleEl.textContent = title;
      bodyEl.appendChild(titleEl);
    }
    var msgEl = document.createElement('div');
    msgEl.className = 'fluent-toast-msg';
    msgEl.textContent = msg;
    bodyEl.appendChild(msgEl);
    toast.appendChild(bodyEl);

    // Close button
    var closeBtnEl = document.createElement('button');
    closeBtnEl.className = 'fluent-toast-close';
    closeBtnEl.setAttribute('aria-label', 'Close');
    closeBtnEl.textContent = '\u00D7';
    toast.appendChild(closeBtnEl);

    // Progress bar
    var duration = (_config.duration && _config.duration[type]) || DEFAULT_DURATIONS[type] || 4000;
    if (_config.progressBar) {
      var progressEl = document.createElement('div');
      progressEl.className = 'fluent-toast-progress';
      progressEl.style.width = '100%';
      progressEl.style.background = colors.border;
      progressEl.style.transitionDuration = duration + 'ms';
      toast.appendChild(progressEl);
    }

    // Close on click
    var dismiss = function () { dismissToast(toast); };
    closeBtnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      dismiss();
    });
    toast.addEventListener('click', dismiss);

    // Insert based on newestOnTop
    if (_config.newestOnTop) {
      container.insertBefore(toast, container.firstChild);
    } else {
      container.appendChild(toast);
    }

    // Trigger slide-in after repaint
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('fluent-toast-in');
        // Start progress bar countdown
        if (_config.progressBar) {
          var bar = toast.querySelector('.fluent-toast-progress');
          if (bar) bar.style.width = '0%';
        }
      });
    });

    // Pause-on-hover
    var timerId = null;
    var remainingTime = duration;
    var startTime = Date.now();

    function startTimer() {
      startTime = Date.now();
      timerId = setTimeout(function () {
        if (toast.parentNode) dismiss();
      }, remainingTime);
    }

    if (_config.pauseOnHover) {
      toast.addEventListener('mouseenter', function () {
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
          remainingTime -= (Date.now() - startTime);
          if (remainingTime < 0) remainingTime = 0;
          // Pause progress bar
          if (_config.progressBar) {
            var bar = toast.querySelector('.fluent-toast-progress');
            if (bar) {
              var computed = window.getComputedStyle(bar);
              bar.style.transitionDuration = '0ms';
              bar.style.width = computed.width;
            }
          }
        }
      });
      toast.addEventListener('mouseleave', function () {
        if (!toast.classList.contains('fluent-toast-out')) {
          // Resume progress bar
          if (_config.progressBar) {
            var bar = toast.querySelector('.fluent-toast-progress');
            if (bar) {
              bar.style.transitionDuration = remainingTime + 'ms';
              bar.style.width = '0%';
            }
          }
          startTimer();
        }
      });
    }

    // Auto-dismiss
    startTimer();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════════════════

  var FluentToast = {

    /**
     * Show a success toast.
     * @param {string} msg
     * @param {string} [title]
     */
    success: function (msg, title) { show('success', msg, title); },

    /**
     * Show an error toast.
     * @param {string} msg
     * @param {string} [title]
     */
    error: function (msg, title) { show('error', msg, title); },

    /**
     * Show a warning toast.
     * @param {string} msg
     * @param {string} [title]
     */
    warning: function (msg, title) { show('warning', msg, title); },

    /**
     * Show an info toast.
     * @param {string} msg
     * @param {string} [title]
     */
    info: function (msg, title) { show('info', msg, title); },

    /**
     * Configure FluentToast options.
     *
     * @param {Object} opts
     * @param {string} [opts.position='top-right']     One of: top-right, top-left, top-center, bottom-right, bottom-left, bottom-center
     * @param {number} [opts.maxToasts=5]              Maximum visible toasts
     * @param {boolean} [opts.pauseOnHover=true]       Pause auto-dismiss timer on hover
     * @param {boolean} [opts.progressBar=false]       Show countdown progress bar
     * @param {boolean} [opts.newestOnTop=true]        Stack newest toasts first
     * @param {Object} [opts.duration]                 Per-type durations in ms: { success, error, warning, info }
     * @returns {FluentToast}
     */
    configure: function (opts) {
      if (!opts || typeof opts !== 'object') return FluentToast;
      if (opts.position && POSITION_STYLES[opts.position]) _config.position = opts.position;
      if (typeof opts.maxToasts === 'number' && opts.maxToasts > 0) _config.maxToasts = opts.maxToasts;
      if (typeof opts.pauseOnHover === 'boolean') _config.pauseOnHover = opts.pauseOnHover;
      if (typeof opts.progressBar === 'boolean') _config.progressBar = opts.progressBar;
      if (typeof opts.newestOnTop === 'boolean') _config.newestOnTop = opts.newestOnTop;
      if (opts.duration && typeof opts.duration === 'object') {
        var types = ['success', 'error', 'warning', 'info'];
        for (var i = 0; i < types.length; i++) {
          if (typeof opts.duration[types[i]] === 'number') {
            _config.duration[types[i]] = opts.duration[types[i]];
          }
        }
      }
      if (typeof opts.nonce === 'string') _config.nonce = opts.nonce;
      if (typeof opts.styles === 'boolean') _config.styles = opts.styles;
      if (typeof opts.customClass === 'string' || opts.customClass === null) _config.customClass = opts.customClass;
      return FluentToast;
    },

    /**
     * Get the current configuration (read-only copy).
     * @returns {Object}
     */
    getConfig: function () {
      return JSON.parse(JSON.stringify(_config));
    },

    /**
     * Bridge FluentToast to a FluentHttpAjaxify instance.
     * Subscribes to HTTP events and auto-shows toasts.
     *
     * @param {Object} api               FluentHttpAjaxify instance
     * @param {Object} [options]          Which events to toast
     * @param {boolean|string} [options.success=true]       Toast on success (true = default msg, string = custom msg)
     * @param {boolean|string} [options.error=true]         Toast on errors
     * @param {boolean|string} [options.validation=true]    Toast on 422
     * @param {boolean|string} [options.networkError=true]  Toast on network errors
     * @returns {FluentToast}
     */
    bridge: function (api, options) {
      if (!api || typeof api.on !== 'function') {
        console.warn('[FluentToast] bridge() requires a FluentHttpAjaxify instance with .on() method');
        return FluentToast;
      }
      var opts = options || {};

      if (opts.success !== false) {
        api.on('success', function (payload) {
          var msg = typeof opts.success === 'string' ? opts.success : 'Request successful';
          FluentToast.success(msg);
        });
      }

      if (opts.error !== false) {
        api.on('error', function (payload) {
          if (payload && payload.error) {
            // Skip network and validation — they have their own handlers
            if (payload.error.status === 0 && opts.networkError !== false) return;
            if (payload.error.status === 422 && opts.validation !== false) return;
            FluentToast.error(payload.error.message || 'Request failed');
          }
        });
      }

      if (opts.validation !== false) {
        api.on('validation', function (payload) {
          var msg = typeof opts.validation === 'string' ? opts.validation : (payload && payload.message ? payload.message : 'Validation failed');
          FluentToast.warning(msg);
        });
      }

      if (opts.networkError !== false) {
        api.on('error:network', function (payload) {
          var msg = typeof opts.networkError === 'string' ? opts.networkError : 'No internet connection';
          FluentToast.error(msg);
        });
      }

      // Also register as the notifier adapter on the instance
      if (typeof api.useNotifier === 'function') {
        api.useNotifier(FluentToast);
      }

      return FluentToast;
    },

    /**
     * Create a NotificationAdapter from a driver name or custom object.
     * Exposes the adapter factory for external use.
     *
     * @param {string|Object} driver
     * @returns {{ success: function, error: function, warning: function, info: function }}
     */
    createAdapter: function (driver) {
      return NotificationAdapter.create(driver);
    },

    /**
     * Detect which notification library is available on the page.
     * @returns {string} One of: 'toastr', 'sweetalert2', 'notyf', 'izitoast', 'console'
     */
    detectLibrary: function () {
      return detectNotifierName();
    },

    /**
     * Use an external notification adapter instead of built-in toasts.
     * All subsequent calls to success/error/warning/info will delegate to it.
     *
     * @param {string|Object} driver
     * @returns {FluentToast}
     */
    useAdapter: function (driver) {
      var adapter = NotificationAdapter.create(driver);
      // Validate adapter has required methods
      var required = ['success', 'error', 'warning', 'info'];
      for (var r = 0; r < required.length; r++) {
        if (typeof adapter[required[r]] !== 'function') {
          throw new Error('[FluentToast] Adapter missing required method: ' + required[r]);
        }
      }
      FluentToast.success = function (msg, title) { adapter.success(msg, title); };
      FluentToast.error   = function (msg, title) { adapter.error(msg, title); };
      FluentToast.warning = function (msg, title) { adapter.warning(msg, title); };
      FluentToast.info    = function (msg, title) { adapter.info(msg, title); };
      return FluentToast;
    },

    /**
     * Dismiss all visible toasts.
     */
    dismissAll: function () {
      if (!isBrowser()) return;
      var containers = document.querySelectorAll('[id^="' + CONTAINER_PREFIX + '"]');
      for (var c = 0; c < containers.length; c++) {
        var toasts = containers[c].querySelectorAll('.fluent-toast:not(.fluent-toast-out)');
        for (var t = 0; t < toasts.length; t++) {
          dismissToast(toasts[t]);
        }
      }
    },

    /** Expose escapeHtml as a utility. */
    escapeHtml: escapeHtml,

    /** Expose NotificationAdapter for advanced use. */
    NotificationAdapter: NotificationAdapter,
  };

  // ── Keyboard dismiss (Escape key) ─────────────────────────────────────
  if (isBrowser()) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        FluentToast.dismissAll();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Auto-Bridge on DOMContentLoaded
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * If FluentHttpAjaxify was loaded before FluentToast and created a
   * global auto-instance, auto-bridge to it for seamless integration.
   */
  if (isBrowser()) {
    var domReady = function (fn) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
      } else {
        fn();
      }
    };

    // Auto-bridge on window.load (all scripts loaded by then)
    var windowReady = function (fn) {
      if (document.readyState === 'complete') {
        setTimeout(fn, 0);
      } else {
        window.addEventListener('load', fn);
      }
    };

    windowReady(function () {
      // Check for FluentHttp global auto-instance
      var globalNames = ['FluentHttp', 'fluentHttp'];
      for (var i = 0; i < globalNames.length; i++) {
        var instance = root[globalNames[i]];
        if (instance && typeof instance.on === 'function' && typeof instance.useNotifier === 'function') {
          // Auto-detect if we should use a third-party library or our built-in
          var detected = detectNotifierName();
          if (detected !== 'console') {
            FluentToast.useAdapter(detected);
          }
          // Register FluentToast as the notifier on the HTTP instance
          instance.useNotifier(FluentToast);
          break;
        }
      }
    });
  }

  return FluentToast;
});
