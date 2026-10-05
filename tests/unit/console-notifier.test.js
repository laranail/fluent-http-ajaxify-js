/**
 * Unit tests for ConsoleNotifier and NotificationAdapter
 */
import { describe, it, expect, vi } from 'vitest';
import { loadHandler } from '../helpers/loader.js';

describe('ConsoleNotifier', () => {
  let FluentHttpAjaxify;

  beforeEach(async () => {
    const mod = await loadHandler();
    FluentHttpAjaxify = mod.FluentHttpAjaxify;
  });

  it('defaults to console notifier', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    expect(api._notifierName).toBe('console');
    expect(typeof api._notifier.success).toBe('function');
    expect(typeof api._notifier.error).toBe('function');
  });

  it('useNotifier() accepts custom adapter object', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    const custom = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };
    api.useNotifier(custom);
    expect(api._notifierName).toBe('custom adapter');
    api._notifier.success('test');
    expect(custom.success).toHaveBeenCalledWith('test');
  });

  it('useNotifier() with string sets notifier name', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api' });
    // Without FluentToast loaded globally, string driver falls back to console
    api.useNotifier('console');
    expect(api._notifierName).toBe('console');
  });
});
