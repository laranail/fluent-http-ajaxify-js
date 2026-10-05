/**
 * Unit tests for standalone FluentToast module
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadToast } from '../helpers/loader.js';

describe('FluentToast', () => {
  let FluentToast;

  beforeEach(async () => {
    FluentToast = await loadToast();
  });

  it('exposes success/error/warning/info methods', () => {
    expect(typeof FluentToast.success).toBe('function');
    expect(typeof FluentToast.error).toBe('function');
    expect(typeof FluentToast.warning).toBe('function');
    expect(typeof FluentToast.info).toBe('function');
  });

  it('exposes configure() method', () => {
    expect(typeof FluentToast.configure).toBe('function');
  });

  it('exposes bridge() method', () => {
    expect(typeof FluentToast.bridge).toBe('function');
  });

  it('exposes dismissAll() method', () => {
    expect(typeof FluentToast.dismissAll).toBe('function');
  });

  it('exposes detectLibrary() method', () => {
    expect(typeof FluentToast.detectLibrary).toBe('function');
    // In test env, no libraries loaded → should return 'console'
    expect(FluentToast.detectLibrary()).toBe('console');
  });

  it('exposes escapeHtml utility', () => {
    expect(FluentToast.escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(FluentToast.escapeHtml('a & b')).toBe('a &amp; b');
    expect(FluentToast.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('exposes NotificationAdapter', () => {
    expect(typeof FluentToast.NotificationAdapter).toBe('object');
    expect(typeof FluentToast.NotificationAdapter.create).toBe('function');
  });

  describe('configure()', () => {
    it('returns FluentToast for chaining', () => {
      const result = FluentToast.configure({ position: 'top-left' });
      expect(result).toBe(FluentToast);
    });

    it('updates config correctly', () => {
      FluentToast.configure({ position: 'bottom-center', maxToasts: 3 });
      const cfg = FluentToast.getConfig();
      expect(cfg.position).toBe('bottom-center');
      expect(cfg.maxToasts).toBe(3);
    });

    it('ignores invalid position', () => {
      FluentToast.configure({ position: 'top-right' }); // reset
      FluentToast.configure({ position: 'invalid-pos' });
      expect(FluentToast.getConfig().position).toBe('top-right');
    });

    it('updates per-type durations', () => {
      FluentToast.configure({ duration: { success: 1000, error: 2000 } });
      const cfg = FluentToast.getConfig();
      expect(cfg.duration.success).toBe(1000);
      expect(cfg.duration.error).toBe(2000);
    });
  });

  describe('getConfig()', () => {
    it('returns a copy (not a reference)', () => {
      const cfg = FluentToast.getConfig();
      cfg.position = 'modified';
      expect(FluentToast.getConfig().position).not.toBe('modified');
    });
  });

  describe('createAdapter()', () => {
    it('returns a custom adapter object as-is', () => {
      const custom = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
      const adapter = FluentToast.createAdapter(custom);
      expect(adapter).toBe(custom);
    });

    it('returns console adapter for unknown driver', () => {
      const adapter = FluentToast.createAdapter('unknown');
      expect(typeof adapter.success).toBe('function');
      expect(typeof adapter.error).toBe('function');
    });
  });

  describe('bridge()', () => {
    it('warns and returns FluentToast if api has no .on()', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = FluentToast.bridge({});
      expect(result).toBe(FluentToast);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('registers event listeners on a valid api', () => {
      const listeners = {};
      const api = {
        on: vi.fn((event, fn) => { listeners[event] = fn; }),
        useNotifier: vi.fn(),
      };
      FluentToast.bridge(api);
      expect(api.on).toHaveBeenCalled();
      expect(api.useNotifier).toHaveBeenCalledWith(FluentToast);
    });
  });

  describe('useAdapter()', () => {
    it('delegates calls to the adapter', () => {
      const custom = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
      FluentToast.useAdapter(custom);
      FluentToast.success('test', 'title');
      expect(custom.success).toHaveBeenCalledWith('test', 'title');
    });
  });
});
