/**
 * Test helper: Load FluentHttpAjaxify in a testable way.
 * 
 * The library is a UMD module. In test context, we simulate the CommonJS path
 * by providing a mock `axios` and requiring the module.
 */
import { vi } from 'vitest';
import { createMockAxios } from './mock-axios.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load and evaluate the handler module, returning the exports.
 * Installs a mock axios on globalThis automatically.
 *
 * @param {Object} [options]
 * @param {Object} [options.mockAxios]  Pre-created mock axios (if not provided, creates one)
 * @returns {{ FluentHttpAjaxify: *, MiddlewareStack: *, Middleware: *, mockAxios: Object }}
 */
export async function loadHandler(options = {}) {
  const mock = options.mockAxios || createMockAxios();

  // Install mock axios globally
  globalThis.axios = mock.axios;

  // Read the source file
  const srcPath = join(process.cwd(), 'assets', 'js', 'FluentHttpAjaxify.js');
  const source = readFileSync(srcPath, 'utf-8');

  // Evaluate in a function context that simulates CommonJS
  const exports = {};
  const module = { exports };

  // The UMD wrapper checks for `define.amd`, `module.exports`, or falls back to `root`.
  // We'll use a Function constructor to evaluate it with our module/exports.
  const wrappedSource = `
    (function(module, exports, require, globalThis, window, self) {
      ${source}
    })
  `;

  const fn = new Function('return ' + wrappedSource.trim())();
  fn(module, exports, () => mock.axios, globalThis, globalThis, globalThis);

  const Handler = module.exports || globalThis.FluentHttpAjaxify;

  return {
    FluentHttpAjaxify: Handler,
    MiddlewareStack: Handler.MiddlewareStack,
    Middleware: Handler.Middleware,
    mockAxios: mock,
  };
}

/**
 * Load the FluentToast standalone module.
 * @returns {Object} FluentToast object
 */
export async function loadToast() {
  const srcPath = join(process.cwd(), 'assets', 'js', 'FluentToast.js');
  const source = readFileSync(srcPath, 'utf-8');

  const exports = {};
  const module = { exports };

  const wrappedSource = `
    (function(module, exports, globalThis, window, self, document) {
      ${source}
    })
  `;

  const fn = new Function('return ' + wrappedSource.trim())();
  fn(module, exports, globalThis, globalThis, globalThis, globalThis.document);

  return module.exports || globalThis.FluentToast;
}
