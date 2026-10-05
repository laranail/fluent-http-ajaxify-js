/**
 * FluentHttp Bundle v3.0.0
 * ────────────────────────────────────────────────────────────────────────────
 * Backward-compatible bundle that loads:
 *   1. FluentHttpAjaxify.js  (core HTTP client)
 *   2. FluentToast.js            (standalone toast notifications)
 *   3. FluentHttpWrapper.js      (high-level convenience patterns)
 *
 * Usage:
 *   <script src="axios.min.js"></script>
 *   <script src="fluent-http-bundle.js"></script>
 *
 * This provides the same single-file experience as v2.1.x where toast
 * notifications were embedded in the handler.
 *
 * For modular setups, load each file separately instead:
 *   <script src="FluentHttpAjaxify.js"></script>
 *   <script src="FluentToast.js"></script>   <!-- optional -->
 *
 * @license MIT
 */
(function () {
  'use strict';

  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var basePath = currentScript.src.substring(0, currentScript.src.lastIndexOf('/') + 1);

  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = basePath + src;
    script.async = false; // preserve load order
    script.onload = callback || function () {};
    script.onerror = function () {
      console.error('[FluentHttp Bundle] Failed to load: ' + src);
    };
    document.head.appendChild(script);
  }

  // Load handler first, then toast, then wrapper (toast auto-bridges to handler)
  loadScript('FluentHttpAjaxify.js', function () {
    loadScript('FluentToast.js', function () {
      loadScript('FluentHttpWrapper.js');
    });
  });
})();
