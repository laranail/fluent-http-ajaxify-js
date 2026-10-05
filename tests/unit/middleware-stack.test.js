/**
 * Unit tests for MiddlewareStack
 */
import { describe, it, expect, vi } from 'vitest';

// Since the library is UMD, we need to load it in a way that exposes internals.
// We'll use a helper that evaluates the file and returns the exports.
import { loadHandler } from '../helpers/loader.js';

describe('MiddlewareStack', () => {
  let MiddlewareStack;

  beforeEach(async () => {
    const mod = await loadHandler();
    MiddlewareStack = mod.MiddlewareStack;
  });

  it('should start empty', () => {
    const stack = new MiddlewareStack();
    expect(stack.length).toBe(0);
    expect(stack.list()).toEqual([]);
  });

  it('push() adds middleware to the end', () => {
    const stack = new MiddlewareStack();
    const fn1 = (next) => next;
    const fn2 = (next) => next;
    stack.push(fn1, 'first');
    stack.push(fn2, 'second');
    expect(stack.length).toBe(2);
    const names = stack.list().map(e => e.name);
    expect(names).toEqual(['first', 'second']);
  });

  it('unshift() adds middleware to the beginning', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'first');
    stack.unshift((next) => next, 'zeroth');
    const names = stack.list().map(e => e.name);
    expect(names).toEqual(['zeroth', 'first']);
  });

  it('before() inserts before a named middleware', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'a');
    stack.push((next) => next, 'c');
    stack.before('c', (next) => next, 'b');
    const names = stack.list().map(e => e.name);
    expect(names).toEqual(['a', 'b', 'c']);
  });

  it('after() inserts after a named middleware', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'a');
    stack.push((next) => next, 'c');
    stack.after('a', (next) => next, 'b');
    const names = stack.list().map(e => e.name);
    expect(names).toEqual(['a', 'b', 'c']);
  });

  it('remove() removes a named middleware', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'a');
    stack.push((next) => next, 'b');
    stack.remove('a');
    expect(stack.length).toBe(1);
    expect(stack.has('a')).toBe(false);
    expect(stack.has('b')).toBe(true);
  });

  it('has() checks for existence', () => {
    const stack = new MiddlewareStack();
    expect(stack.has('x')).toBe(false);
    stack.push((next) => next, 'x');
    expect(stack.has('x')).toBe(true);
  });

  it('throws on duplicate names', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'dup');
    expect(() => stack.push((next) => next, 'dup')).toThrow('duplicate');
  });

  it('throws on non-function middleware', () => {
    const stack = new MiddlewareStack();
    expect(() => stack.push('not a function')).toThrow('must be a function');
  });

  it('before() throws if target not found', () => {
    const stack = new MiddlewareStack();
    expect(() => stack.before('missing', (n) => n)).toThrow('not found');
  });

  it('resolve() composes middleware around a handler', async () => {
    const stack = new MiddlewareStack();
    const log = [];

    stack.push((next) => async (cfg) => {
      log.push('outer-before');
      const result = await next(cfg);
      log.push('outer-after');
      return result;
    }, 'outer');

    stack.push((next) => async (cfg) => {
      log.push('inner-before');
      const result = await next(cfg);
      log.push('inner-after');
      return result;
    }, 'inner');

    const handler = stack.resolve(async (cfg) => {
      log.push('core');
      return { data: 'ok', status: 200 };
    });

    const result = await handler({});
    expect(result).toEqual({ data: 'ok', status: 200 });
    // The LAST middleware pushed is outermost (MiddlewareStack docblock:
    // "stack[last] is outermost"), so 'inner' -- pushed second -- runs first
    // on the request and last on the response.
    expect(log).toEqual(['inner-before', 'outer-before', 'core', 'outer-after', 'inner-after']);
  });

  it('clone() creates an independent copy', () => {
    const stack = new MiddlewareStack();
    stack.push((next) => next, 'a');
    const clone = stack.clone();
    clone.push((next) => next, 'b');
    expect(stack.length).toBe(1);
    expect(clone.length).toBe(2);
  });
});
