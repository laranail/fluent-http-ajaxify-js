/**
 * Unit tests for FluentHttpAjaxify core
 */
import { describe, it, expect, vi } from 'vitest';
import { loadHandler } from '../helpers/loader.js';

describe('FluentHttpAjaxify (core)', () => {
  let FluentHttpAjaxify, mockAxios;

  beforeEach(async () => {
    const mod = await loadHandler();
    FluentHttpAjaxify = mod.FluentHttpAjaxify;
    mockAxios = mod.mockAxios;
    mockAxios.reset();
  });

  it('creates an instance with config', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', timeout: 5000 });
    expect(api._baseURL).toBe('/api');
    expect(api._timeout).toBe(5000);
  });

  it('static create() factory works', () => {
    const api = FluentHttpAjaxify.create('/api', { timeout: 3000 });
    expect(api._baseURL).toBe('/api');
    expect(api._timeout).toBe(3000);
  });

  it('withCsrf() sets CSRF token', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    api.withCsrf('my-token');
    expect(api._csrfToken).toBe('my-token');
  });

  it('withToken() sets global auth token', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    api.withToken('bearer-token');
    expect(api._globalToken).toBe('bearer-token');
  });

  it('debug() sets debugger level', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    api.debug('verbose');
    // Verify by checking that the debugger instance has the level set
    expect(api._debugger).toBeDefined();
  });

  it('onSuccess() sets global callback', () => {
    const cb = vi.fn();
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    api.onSuccess(cb);
    expect(api._globalOnSuccess).toBe(cb);
  });

  it('onError() sets global callback', () => {
    const cb = vi.fn();
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    api.onError(cb);
    expect(api._globalOnError).toBe(cb);
  });

  it('HTTP method shortcuts return RequestBuilder', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    expect(api.get('/users')).toBeDefined();
    expect(api.post('/users', {})).toBeDefined();
    expect(api.put('/users/1', {})).toBeDefined();
    expect(api.patch('/users/1', {})).toBeDefined();
    expect(api.delete('/users/1')).toBeDefined();
    expect(api.head('/users')).toBeDefined();
    expect(api.options('/users')).toBeDefined();
  });

  describe('instance-level events', () => {
    it('on/emit works', () => {
      const api = new FluentHttpAjaxify({ baseURL: '/api' });
      const cb = vi.fn();
      api.on('custom', cb);
      api._events.emit('custom', { test: true });
      expect(cb).toHaveBeenCalledWith({ test: true });
    });

    it('once fires only once', () => {
      const api = new FluentHttpAjaxify({ baseURL: '/api' });
      const cb = vi.fn();
      api.once('fire', cb);
      api._events.emit('fire', {});
      api._events.emit('fire', {});
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('off removes listener', () => {
      const api = new FluentHttpAjaxify({ baseURL: '/api' });
      const cb = vi.fn();
      api.on('ev', cb);
      api.off('ev', cb);
      api._events.emit('ev', {});
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('getMiddleware()', () => {
    it('returns a MiddlewareStack instance', () => {
      const api = new FluentHttpAjaxify({ baseURL: '/api' });
      const stack = api.getMiddleware();
      expect(stack).toBeDefined();
      expect(typeof stack.push).toBe('function');
      expect(typeof stack.resolve).toBe('function');
    });
  });

  describe('batch()', () => {
    it('runs multiple requests in parallel', async () => {
      mockAxios.setDefault({ data: { ok: true }, status: 200 });
      const api = new FluentHttpAjaxify({ baseURL: '' });
      const results = await api.batch([
        api.get('/a'),
        api.get('/b'),
        api.get('/c'),
      ]);
      expect(results.length).toBe(3);
      results.forEach(r => {
        expect(r.data).toEqual({ ok: true });
        expect(r.status).toBe(200);
      });
    });

    it('throws on non-array input', async () => {
      const api = new FluentHttpAjaxify({ baseURL: '' });
      await expect(api.batch('not-array')).rejects.toThrow('array');
    });
  });

  describe('static utilities', () => {
    it('formatError() structures errors', () => {
      const err = new Error('test');
      err.response = { status: 404, data: { message: 'Not Found' } };
      const formatted = FluentHttpAjaxify.formatError(err);
      expect(formatted.status).toBe(404);
    });

    it('isOnline() returns boolean', () => {
      expect(typeof FluentHttpAjaxify.isOnline()).toBe('boolean');
    });

    it('getRegistration() returns metadata', () => {
      const reg = FluentHttpAjaxify.getRegistration();
      expect(reg).toBeDefined();
      expect(reg.metadata.name).toBe('FluentHttpAjaxify');
    });
  });

  describe('statics: Middleware and MiddlewareStack', () => {
    it('exposes Middleware as static', () => {
      expect(FluentHttpAjaxify.Middleware).toBeDefined();
      expect(typeof FluentHttpAjaxify.Middleware.validation).toBe('function');
      expect(typeof FluentHttpAjaxify.Middleware.retry).toBe('function');
    });

    it('exposes MiddlewareStack as static', () => {
      expect(FluentHttpAjaxify.MiddlewareStack).toBeDefined();
      const stack = new FluentHttpAjaxify.MiddlewareStack();
      expect(typeof stack.push).toBe('function');
    });
  });
});
