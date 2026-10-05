/**
 * Unit tests for RequestBuilder
 */
import { describe, it, expect, vi } from 'vitest';
import { loadHandler } from '../helpers/loader.js';

describe('RequestBuilder', () => {
  let FluentHttpAjaxify, mockAxios;

  beforeEach(async () => {
    const mod = await loadHandler();
    FluentHttpAjaxify = mod.FluentHttpAjaxify;
    mockAxios = mod.mockAxios;
    mockAxios.reset();
  });

  it('send() returns { data, error, status } on success', async () => {
    mockAxios.setDefault({ data: { id: 1 }, status: 200 });
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const result = await api.get('/users').send();
    expect(result.data).toEqual({ id: 1 });
    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
  });

  it('send() returns error shape on failure', async () => {
    mockAxios.enqueue(mockAxios.createError(500, {}, 'Server Error'));
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const result = await api.get('/fail').send();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(500);
  });

  it('prevents double send', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const builder = api.get('/test');
    await builder.send();
    const result2 = await builder.send();
    expect(result2.error.message).toContain('already');
  });

  it('withToken() sets Authorization header', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').withToken('abc123').send();
    const sentConfig = mockAxios.history[0];
    expect(sentConfig.headers.Authorization).toBe('Bearer abc123');
  });

  it('withHeader() sets custom header', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').withHeader('X-Custom', 'value').send();
    expect(mockAxios.history[0].headers['X-Custom']).toBe('value');
  });

  it('withParam() sets URL params', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').withParam('page', 1).send();
    expect(mockAxios.history[0].params.page).toBe(1);
  });

  it('withBody() sets payload', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.post('/test').withBody({ name: 'test' }).send();
    expect(mockAxios.history[0].data).toEqual({ name: 'test' });
  });

  it('withTimeout() overrides timeout', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').withTimeout(5000).send();
    expect(mockAxios.history[0].timeout).toBe(5000);
  });

  it('asBlob() sets responseType', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/file').asBlob().send();
    expect(mockAxios.history[0].responseType).toBe('blob');
  });

  it('onSuccess callback fires on success', async () => {
    const cb = vi.fn();
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').onSuccess(cb).send();
    expect(cb).toHaveBeenCalled();
  });

  it('onError callback fires on error', async () => {
    mockAxios.enqueue(mockAxios.createError(404, {}, 'Not Found'));
    const cb = vi.fn();
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').onError(cb).send();
    expect(cb).toHaveBeenCalled();
  });

  it('onFinally callback fires always', async () => {
    const cb = vi.fn();
    const api = new FluentHttpAjaxify({ baseURL: '' });
    await api.get('/test').onFinally(cb).send();
    expect(cb).toHaveBeenCalled();
  });

  it('clone() creates an independent builder', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const original = api.get('/test').withParam('a', 1);
    const cloned = original.clone();
    cloned.withParam('b', 2);
    await original.send();
    expect(mockAxios.history[0].params.b).toBeUndefined();
  });

  describe('convenience methods', () => {
    it('withCredentials() sets extraOptions', async () => {
      const api = new FluentHttpAjaxify({ baseURL: '' });
      await api.get('/test').withCredentials().send();
      expect(mockAxios.history[0].withCredentials).toBe(true);
    });

    it('asFormEncoded() sets Content-Type header', async () => {
      const api = new FluentHttpAjaxify({ baseURL: '' });
      await api.post('/test').asFormEncoded().withBody({ a: 1 }).send();
      expect(mockAxios.history[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('download() sets responseType to blob', async () => {
      const api = new FluentHttpAjaxify({ baseURL: '' });
      await api.get('/file.pdf').download().send();
      expect(mockAxios.history[0].responseType).toBe('blob');
    });
  });

  describe('.use() per-request middleware', () => {
    it('runs per-request middleware', async () => {
      const log = [];
      const api = new FluentHttpAjaxify({ baseURL: '' });
      const mw = (next) => async (cfg) => {
        log.push('middleware');
        return next(cfg);
      };
      await api.get('/test').use(mw).send();
      expect(log).toContain('middleware');
    });

    it('clone() copies per-request middleware', async () => {
      const log = [];
      const mw = (next) => async (cfg) => {
        log.push('mw');
        return next(cfg);
      };
      const api = new FluentHttpAjaxify({ baseURL: '' });
      const b1 = api.get('/test').use(mw, 'logger');
      const b2 = b1.clone();
      expect(b2.getMiddleware()).not.toBeNull();
      expect(b2.getMiddleware().has('logger')).toBe(true);
    });
  });
});
