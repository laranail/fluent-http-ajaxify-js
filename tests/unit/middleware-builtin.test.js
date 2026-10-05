/**
 * Unit tests for built-in Middleware factories
 */
import { describe, it, expect, vi } from 'vitest';
import { loadHandler } from '../helpers/loader.js';

describe('Middleware (built-in factories)', () => {
  let Middleware, MiddlewareStack;

  beforeEach(async () => {
    const mod = await loadHandler();
    Middleware = mod.Middleware;
    MiddlewareStack = mod.MiddlewareStack;
  });

  // Helper: run a single middleware with a mock core handler
  async function runMiddleware(mw, config, coreResult) {
    const core = vi.fn(async () => coreResult || { data: 'ok', error: null, status: 200 });
    const handler = mw(core);
    return { result: await handler(config), core };
  }

  describe('validation', () => {
    it('passes when all rules are met', async () => {
      const mw = Middleware.validation({ email: 'required|email' });
      const { result } = await runMiddleware(mw, { data: { email: 'test@example.com' } });
      expect(result.status).toBe(200);
    });

    it('returns 422 on missing required field', async () => {
      const mw = Middleware.validation({ name: 'required' });
      const { result, core } = await runMiddleware(mw, { data: {} });
      expect(result.status).toBe(422);
      expect(result.error.errors.name).toBeDefined();
      expect(core).not.toHaveBeenCalled();
    });

    it('returns 422 on invalid email', async () => {
      const mw = Middleware.validation({ email: 'required|email' });
      const { result } = await runMiddleware(mw, { data: { email: 'not-an-email' } });
      expect(result.status).toBe(422);
    });

    it('validates min/max for strings', async () => {
      const mw = Middleware.validation({ name: 'min:3|max:10' });
      const { result } = await runMiddleware(mw, { data: { name: 'ab' } });
      expect(result.status).toBe(422);
    });

    it('validates min/max for numbers', async () => {
      const mw = Middleware.validation({ age: 'number|min:18' });
      const { result } = await runMiddleware(mw, { data: { age: 10 } });
      expect(result.status).toBe(422);
    });

    it('validates "in" rule', async () => {
      const mw = Middleware.validation({ role: 'in:admin,user,mod' });
      const { result } = await runMiddleware(mw, { data: { role: 'hacker' } });
      expect(result.status).toBe(422);
    });

    it('supports custom function rules', async () => {
      const mw = Middleware.validation({ age: (v) => v >= 18 });
      const { result } = await runMiddleware(mw, { data: { age: 10 } });
      expect(result.status).toBe(422);
    });

    it('skips non-required empty fields', async () => {
      const mw = Middleware.validation({ nickname: 'string|min:2' });
      const { result } = await runMiddleware(mw, { data: {} });
      expect(result.status).toBe(200); // nickname not required, not present → skip
    });

    it('skips FormData bodies', async () => {
      const mw = Middleware.validation({ name: 'required' });
      const { result } = await runMiddleware(mw, { data: new FormData() });
      expect(result.status).toBe(200); // FormData skipped
    });
  });

  describe('retry', () => {
    it('retries on server error and succeeds', async () => {
      let attempt = 0;
      const core = vi.fn(async () => {
        attempt++;
        if (attempt < 3) return { data: null, error: { status: 500, message: 'fail' }, status: 500 };
        return { data: 'ok', error: null, status: 200 };
      });
      const mw = Middleware.retry({ attempts: 3, delay: 1 });
      const handler = mw(core);
      const result = await handler({});
      expect(result.status).toBe(200);
      expect(core).toHaveBeenCalledTimes(3);
    });

    it('does not retry 4xx errors by default', async () => {
      const core = vi.fn(async () => ({ data: null, error: { status: 422, message: 'invalid' }, status: 422 }));
      const mw = Middleware.retry({ attempts: 3, delay: 1 });
      const handler = mw(core);
      const result = await handler({});
      expect(result.status).toBe(422);
      expect(core).toHaveBeenCalledTimes(1);
    });
  });

  describe('auth', () => {
    it('injects Authorization header', async () => {
      const mw = Middleware.auth(() => 'my-token', 'Bearer');
      const config = { headers: {} };
      const { core } = await runMiddleware(mw, config);
      expect(core.mock.calls[0][0].headers.Authorization).toBe('Bearer my-token');
    });

    it('accepts static string token', async () => {
      const mw = Middleware.auth('static-token');
      const config = { headers: {} };
      const { core } = await runMiddleware(mw, config);
      expect(core.mock.calls[0][0].headers.Authorization).toBe('Bearer static-token');
    });
  });

  describe('logging', () => {
    it('logs request and response', async () => {
      const logger = { log: vi.fn(), error: vi.fn() };
      const mw = Middleware.logging(logger);
      await runMiddleware(mw, { method: 'GET', url: '/test' });
      expect(logger.log).toHaveBeenCalledTimes(2); // request + response
    });
  });

  describe('cache', () => {
    it('caches GET responses', async () => {
      let callCount = 0;
      const core = vi.fn(async () => {
        callCount++;
        return { data: { id: callCount }, error: null, status: 200 };
      });
      const mw = Middleware.cache({ ttl: 5000 });
      const handler = mw(core);

      const r1 = await handler({ method: 'GET', url: '/users', params: {} });
      const r2 = await handler({ method: 'GET', url: '/users', params: {} });
      expect(r1.data.id).toBe(1);
      expect(r2.data.id).toBe(1); // cached
      expect(core).toHaveBeenCalledTimes(1);
    });

    it('does not cache POST', async () => {
      const core = vi.fn(async () => ({ data: 'ok', error: null, status: 200 }));
      const mw = Middleware.cache({ ttl: 5000 });
      const handler = mw(core);
      await handler({ method: 'POST', url: '/users', params: {} });
      await handler({ method: 'POST', url: '/users', params: {} });
      expect(core).toHaveBeenCalledTimes(2);
    });
  });

  describe('guard', () => {
    it('blocks requests that fail the predicate', async () => {
      const mw = Middleware.guard(() => false);
      const { result, core } = await runMiddleware(mw, {});
      expect(result.status).toBe(-1);
      expect(result.error.message).toContain('blocked');
      expect(core).not.toHaveBeenCalled();
    });

    it('allows requests that pass the predicate', async () => {
      const mw = Middleware.guard(() => true);
      const { result } = await runMiddleware(mw, {});
      expect(result.status).toBe(200);
    });
  });

  describe('timeout', () => {
    it('sets timeout on config', async () => {
      const mw = Middleware.timeout(5000);
      const config = {};
      const core = vi.fn(async (cfg) => {
        expect(cfg.timeout).toBe(5000);
        return { data: 'ok', error: null, status: 200 };
      });
      const handler = mw(core);
      await handler(config);
    });
  });

  describe('mapRequest', () => {
    it('transforms config before sending', async () => {
      const mw = Middleware.mapRequest((cfg) => ({ ...cfg, custom: true }));
      const core = vi.fn(async (cfg) => {
        expect(cfg.custom).toBe(true);
        return { data: 'ok', error: null, status: 200 };
      });
      const handler = mw(core);
      await handler({ method: 'GET' });
    });
  });

  describe('mapResponse', () => {
    it('transforms result after response', async () => {
      const mw = Middleware.mapResponse((result) => ({ ...result, data: result.data.toUpperCase() }));
      const { result } = await runMiddleware(mw, {}, { data: 'hello', error: null, status: 200 });
      expect(result.data).toBe('HELLO');
    });
  });

  describe('transformError', () => {
    it('transforms error objects', async () => {
      const mw = Middleware.transformError((err) => ({ ...err, message: 'Custom: ' + err.message }));
      const errorResult = { data: null, error: { status: 500, message: 'fail' }, status: 500 };
      const { result } = await runMiddleware(mw, {}, errorResult);
      expect(result.error.message).toBe('Custom: fail');
    });
  });

  describe('history', () => {
    it('records request/response entries', async () => {
      const container = [];
      const mw = Middleware.history(container);
      await runMiddleware(mw, { method: 'GET', url: '/test', headers: {}, data: null });
      expect(container.length).toBe(1);
      expect(container[0].request.method).toBe('GET');
      expect(container[0].response.status).toBe(200);
      expect(container[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('mock', () => {
    it('returns queued responses', async () => {
      const mw = Middleware.mock([
        { data: 'first', status: 200 },
        { data: 'second', status: 201 },
      ]);
      const core = vi.fn(async () => ({ data: 'real', error: null, status: 200 }));
      const handler = mw(core);
      const r1 = await handler({});
      const r2 = await handler({});
      const r3 = await handler({}); // queue exhausted, falls through
      expect(r1.data).toBe('first');
      expect(r2.data).toBe('second');
      expect(r3.data).toBe('real');
      expect(core).toHaveBeenCalledTimes(1);
    });

    it('supports function handler', async () => {
      const mw = Middleware.mock((cfg) => ({ data: cfg.url, error: null, status: 200 }));
      const core = vi.fn();
      const handler = mw(core);
      const result = await handler({ url: '/test' });
      expect(result.data).toBe('/test');
      expect(core).not.toHaveBeenCalled();
    });
  });

  describe('rateLimit', () => {
    it('throttles requests beyond max per window', async () => {
      const mw = Middleware.rateLimit({ max: 2, windowMs: 100 });
      const core = vi.fn(async () => ({ data: 'ok', error: null, status: 200 }));
      const handler = mw(core);

      const start = Date.now();
      await handler({}); // 1
      await handler({}); // 2
      await handler({}); // 3 — should wait
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50); // some delay expected
      expect(core).toHaveBeenCalledTimes(3);
    });
  });
});
