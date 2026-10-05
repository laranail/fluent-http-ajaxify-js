/**
 * Mock Axios helper for testing FluentHttpAjaxify.
 * Provides a configurable mock that mimics the Axios API.
 */
import { vi } from 'vitest';

/**
 * Create a mock axios function with queue-based responses.
 *
 * @returns {{ axios: function, enqueue: function, reset: function, history: Array }}
 */
export function createMockAxios() {
  const history = [];
  const queue = [];
  let defaultResponse = { data: { ok: true }, status: 200, headers: {} };

  const axios = vi.fn(async (config) => {
    history.push({ ...config });

    if (queue.length > 0) {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(config);
      return { status: 200, headers: {}, ...next };
    }

    return { ...defaultResponse };
  });

  return {
    axios,
    history,

    /**
     * Enqueue a response (or Error to simulate failure).
     * @param {Object|Error|function} response
     */
    enqueue(response) {
      queue.push(response);
    },

    /**
     * Set the default response when queue is empty.
     * @param {Object} response
     */
    setDefault(response) {
      defaultResponse = { status: 200, headers: {}, ...response };
    },

    /**
     * Create an Axios-style error object.
     * @param {number} status
     * @param {*} data
     * @param {string} message
     * @returns {Error}
     */
    createError(status, data, message) {
      const err = new Error(message || 'Request failed');
      err.response = { status, data, headers: {} };
      err.config = {};
      err.isAxiosError = true;
      return err;
    },

    /**
     * Create a network error (no response).
     * @param {string} [message]
     * @returns {Error}
     */
    createNetworkError(message) {
      const err = new Error(message || 'Network Error');
      err.config = {};
      err.isAxiosError = true;
      // No .response property — indicates network failure
      return err;
    },

    /**
     * Create a timeout error.
     * @returns {Error}
     */
    createTimeoutError() {
      const err = new Error('timeout of 10000ms exceeded');
      err.code = 'ECONNABORTED';
      err.config = {};
      err.isAxiosError = true;
      return err;
    },

    /**
     * Create a cancellation error.
     * @returns {Error}
     */
    createCancelError() {
      const err = new Error('canceled');
      err.code = 'ERR_CANCELED';
      err.config = {};
      err.isAxiosError = true;
      return err;
    },

    /**
     * Reset history and queue.
     */
    reset() {
      history.length = 0;
      queue.length = 0;
      axios.mockClear();
    },
  };
}

/**
 * Install mock axios on globalThis so the UMD factory picks it up.
 *
 * @param {Object} mockAxios  Object returned by createMockAxios()
 */
export function installMockAxios(mockAxios) {
  globalThis.axios = mockAxios.axios;
}

/**
 * Remove mock axios from globalThis.
 */
export function uninstallMockAxios() {
  delete globalThis.axios;
}
