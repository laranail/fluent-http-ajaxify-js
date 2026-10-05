/**
 * Vitest global test setup
 * Runs before each test file.
 */
import { vi } from 'vitest';

// Ensure global window/document are available (jsdom)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// Provide a minimal meta tag helper
globalThis.setMeta = function (name, content) {
  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
  return meta;
};

// Clean up DOM between tests
afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
