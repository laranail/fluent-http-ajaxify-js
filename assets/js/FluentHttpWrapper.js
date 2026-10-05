/**
 * FluentHttpWrapper v3.0.0
 * ────────────────────────────────────────────────────────────────────────────
 * High-level convenience patterns built on FluentHttpAjaxify.
 * Provides opinionated shortcuts for common workflows:
 *   - saveToDb()     — POST/PUT with toast feedback + redirect handling
 *   - queryApi()     — GET with loading state + caching
 *   - submitForm()   — serialize, submit, error display, reset
 *   - deleteResource() — DELETE with confirm dialog + toast
 *   - uploadFile()   — upload with progress callback
 *   - batchActions() — parallel/sequential multi-request
 *
 * UMD module: works via <script> tag, ESM import, or CommonJS require().
 * Requires FluentHttpAjaxify to be loaded before this script.
 *
 * @license MIT
 * @version 3.0.0
 */
(function (root, factory) {
  /* istanbul ignore next */
  if (typeof define === 'function' && define.amd) {
    define(['FluentHttpAjaxify'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./FluentHttpAjaxify'));
  } else {
    root.FluentHttpWrapper = factory(root.FluentHttpAjaxify);
  }
}(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (FluentHttpAjaxify) {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  function noop() {}

  function resolveClient(wrapper) {
    return wrapper._client || (FluentHttpAjaxify && FluentHttpAjaxify._autoInstance) || null;
  }

  function mergeOpts(defaults, overrides) {
    var result = {};
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) result[keys[i]] = defaults[keys[i]];
    if (overrides) {
      var oKeys = Object.keys(overrides);
      for (var j = 0; j < oKeys.length; j++) result[oKeys[j]] = overrides[oKeys[j]];
    }
    return result;
  }

  function setLoading(el, loading) {
    if (!el) return;
    if (loading) {
      el.disabled = true;
      el.setAttribute('data-fluent-loading', 'true');
    } else {
      el.disabled = false;
      el.removeAttribute('data-fluent-loading');
    }
  }

  // ── FluentHttpWrapper ───────────────────────────────────────────────────

  /**
   * High-level wrapper providing opinionated shortcuts for common workflows.
   *
   * @example
   * const wrapper = new FluentHttpWrapper(api, {
   *   toastOnSuccess: true,
   *   toastOnError: true,
   * });
   * await wrapper.saveToDb('/api/users', { name: 'John' });
   */
  function FluentHttpWrapper(clientOrConfig, config) {
    if (clientOrConfig && typeof clientOrConfig.get === 'function') {
      this._client = clientOrConfig;
      this._config = mergeOpts(FluentHttpWrapper.DEFAULTS, config || {});
    } else {
      this._client = null; // Will use auto-instance
      this._config = mergeOpts(FluentHttpWrapper.DEFAULTS, clientOrConfig || {});
    }
  }

  FluentHttpWrapper.DEFAULTS = {
    toastOnSuccess:  true,
    toastOnError:    true,
    successMessage:  'Operation completed successfully',
    errorMessage:    'An error occurred',
    deleteConfirm:   'Are you sure you want to delete this?',
    redirectOnSuccess: false,
    loadingSelector:  null,
  };

  /**
   * Create a wrapper from an existing FluentHttpAjaxify instance.
   * @param {FluentHttpAjaxify} client
   * @param {Object} [config]
   * @returns {FluentHttpWrapper}
   */
  FluentHttpWrapper.create = function (client, config) {
    return new FluentHttpWrapper(client, config);
  };

  // ── Instance Methods ────────────────────────────────────────────────────

  var proto = FluentHttpWrapper.prototype;

  /**
   * Save data to the server (POST for create, PUT for update).
   *
   * @param {string} endpoint
   * @param {Object} data
   * @param {Object} [opts]
   * @param {string}   [opts.method='POST']       HTTP method
   * @param {string}   [opts.successMessage]       Toast message on success
   * @param {string}   [opts.errorMessage]         Toast message on error
   * @param {boolean}  [opts.toastOnSuccess]       Show success toast
   * @param {boolean}  [opts.toastOnError]         Show error toast
   * @param {string}   [opts.redirect]             Redirect URL on success
   * @param {function} [opts.onBeforeSave]         Pre-save hook (return false to cancel)
   * @param {function} [opts.onAfterSave]          Post-save hook
   * @param {HTMLElement} [opts.loadingEl]          Element to disable during request
   * @returns {Promise<{ data, error, status }>}
   */
  proto.saveToDb = async function (endpoint, data, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    // Before hook
    if (cfg.onBeforeSave) {
      var before = cfg.onBeforeSave(data);
      if (before === false) return { data: null, error: null, status: 0 };
      if (before && typeof before.then === 'function') {
        var asyncBefore = await before;
        if (asyncBefore === false) return { data: null, error: null, status: 0 };
      }
    }

    // Loading state
    if (cfg.loadingEl) setLoading(cfg.loadingEl, true);

    var method = (cfg.method || 'POST').toUpperCase();
    var builder;
    switch (method) {
      case 'PUT':   builder = client.put(endpoint, data); break;
      case 'PATCH': builder = client.patch(endpoint, data); break;
      default:      builder = client.post(endpoint, data); break;
    }

    var result = await builder.send();

    if (cfg.loadingEl) setLoading(cfg.loadingEl, false);

    if (result.error) {
      if (cfg.toastOnError && client._notifier) {
        client._notifier.error(result.error.message || cfg.errorMessage);
      }
    } else {
      if (cfg.toastOnSuccess && client._notifier) {
        client._notifier.success(cfg.successMessage);
      }
      if (cfg.redirect && isBrowser()) {
        window.location.href = cfg.redirect;
      }
    }

    // After hook
    if (cfg.onAfterSave) {
      try { cfg.onAfterSave(result); } catch (_) {}
    }

    return result;
  };

  /**
   * Query an API endpoint (GET) with optional caching and loading state.
   *
   * @param {string} endpoint
   * @param {Object} [params]
   * @param {Object} [opts]
   * @param {number}   [opts.cacheTtl]             Cache duration in ms
   * @param {function} [opts.onBeforeQuery]         Pre-query hook
   * @param {function} [opts.onAfterQuery]          Post-query hook
   * @param {HTMLElement} [opts.loadingEl]          Element to disable during request
   * @returns {Promise<{ data, error, status }>}
   */
  proto.queryApi = async function (endpoint, params, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    if (cfg.onBeforeQuery) {
      try { cfg.onBeforeQuery(endpoint, params); } catch (_) {}
    }

    if (cfg.loadingEl) setLoading(cfg.loadingEl, true);

    var builder = client.get(endpoint);
    if (params) builder = builder.withParams(params);
    if (cfg.cacheTtl) builder = builder.cache(cfg.cacheTtl);

    var result = await builder.send();

    if (cfg.loadingEl) setLoading(cfg.loadingEl, false);

    if (result.error && cfg.toastOnError && client._notifier) {
      client._notifier.error(result.error.message || cfg.errorMessage);
    }

    if (cfg.onAfterQuery) {
      try { cfg.onAfterQuery(result); } catch (_) {}
    }

    return result;
  };

  /**
   * Submit a form via AJAX.
   * Delegates to FluentHttpAjaxify.bindForm() internally.
   *
   * @param {string|HTMLFormElement} formOrSelector
   * @param {Object} [opts]  Same options as bindForm() plus wrapper defaults
   * @returns {FormHandler} The bound FormHandler instance (from client._boundForms)
   */
  proto.submitForm = function (formOrSelector, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    return client.bindForm(formOrSelector, cfg);
  };

  /**
   * Delete a resource with confirmation dialog.
   *
   * @param {string} endpoint
   * @param {Object} [opts]
   * @param {string}   [opts.confirm]              Confirmation message
   * @param {string}   [opts.successMessage]       Toast on success
   * @param {string}   [opts.redirect]             Redirect URL after delete
   * @param {HTMLElement} [opts.loadingEl]          Element to disable during request
   * @returns {Promise<{ data, error, status }|null>}  null if user cancelled
   */
  proto.deleteResource = async function (endpoint, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    var confirmMsg = cfg.confirm || cfg.deleteConfirm;
    if (confirmMsg) {
      var confirmed = false;
      if (typeof window.Swal !== 'undefined') {
        var swalResult = await window.Swal.fire({
          title: confirmMsg,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Delete',
          confirmButtonColor: '#ef4444',
        });
        confirmed = swalResult.isConfirmed;
      } else if (isBrowser()) {
        confirmed = window.confirm(confirmMsg);
      }
      if (!confirmed) return null;
    }

    if (cfg.loadingEl) setLoading(cfg.loadingEl, true);

    var result = await client.delete(endpoint).send();

    if (cfg.loadingEl) setLoading(cfg.loadingEl, false);

    if (result.error) {
      if (cfg.toastOnError && client._notifier) {
        client._notifier.error(result.error.message || cfg.errorMessage);
      }
    } else {
      if (cfg.toastOnSuccess && client._notifier) {
        client._notifier.success(cfg.successMessage || 'Deleted successfully');
      }
      if (cfg.redirect && isBrowser()) {
        window.location.href = cfg.redirect;
      }
    }

    return result;
  };

  /**
   * Upload a file with progress tracking.
   *
   * @param {string} endpoint
   * @param {File|FormData} file        File object or pre-built FormData
   * @param {Object} [opts]
   * @param {string}   [opts.fieldName='file']     Form field name for the file
   * @param {Object}   [opts.extraData]            Additional fields to include
   * @param {function} [opts.onProgress]            Progress callback (percent: number)
   * @param {HTMLElement} [opts.loadingEl]          Element to disable during upload
   * @returns {Promise<{ data, error, status }>}
   */
  proto.uploadFile = async function (endpoint, file, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    var formData;
    if (typeof FormData !== 'undefined' && file instanceof FormData) {
      formData = file;
    } else {
      formData = new FormData();
      formData.append(cfg.fieldName || 'file', file);
    }

    // Add extra fields
    if (cfg.extraData && typeof cfg.extraData === 'object') {
      var keys = Object.keys(cfg.extraData);
      for (var i = 0; i < keys.length; i++) {
        formData.append(keys[i], cfg.extraData[keys[i]]);
      }
    }

    if (cfg.loadingEl) setLoading(cfg.loadingEl, true);

    var builder = client.post(endpoint, formData);
    if (cfg.onProgress) builder = builder.onProgress(cfg.onProgress);

    var result = await builder.send();

    if (cfg.loadingEl) setLoading(cfg.loadingEl, false);

    if (result.error) {
      if (cfg.toastOnError && client._notifier) {
        client._notifier.error(result.error.message || 'Upload failed');
      }
    } else {
      if (cfg.toastOnSuccess && client._notifier) {
        client._notifier.success(cfg.successMessage || 'Upload complete');
      }
    }

    return result;
  };

  /**
   * Execute multiple actions in parallel or sequence.
   *
   * @param {Array<{method: string, endpoint: string, data?: Object}>} actions
   * @param {Object} [opts]
   * @param {boolean}  [opts.parallel=true]  Execute in parallel (true) or sequence (false)
   * @returns {Promise<Array<{ data, error, status }>>}
   */
  proto.batchActions = async function (actions, opts) {
    var cfg = mergeOpts(this._config, opts);
    var client = resolveClient(this);
    if (!client) throw new Error('[FluentHttpWrapper] No FluentHttpAjaxify instance available');

    if (!Array.isArray(actions)) throw new TypeError('[FluentHttpWrapper] batchActions() requires an array');

    function buildRequest(action) {
      var method = (action.method || 'GET').toUpperCase();
      switch (method) {
        case 'POST':   return client.post(action.endpoint, action.data);
        case 'PUT':    return client.put(action.endpoint, action.data);
        case 'PATCH':  return client.patch(action.endpoint, action.data);
        case 'DELETE': return client.delete(action.endpoint, action.data);
        default:       return client.get(action.endpoint).withParams(action.data || {});
      }
    }

    if (cfg.parallel !== false) {
      // Parallel execution
      var builders = actions.map(buildRequest);
      return client.batch(builders);
    } else {
      // Sequential execution
      var results = [];
      for (var i = 0; i < actions.length; i++) {
        var result = await buildRequest(actions[i]).send();
        results.push(result);
        // Stop on first error if configured
        if (result.error && cfg.stopOnError) break;
      }
      return results;
    }
  };

  return FluentHttpWrapper;

}));
