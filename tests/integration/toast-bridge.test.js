/**
 * Integration tests: FluentToast bridge with FluentHttpAjaxify
 */
import { describe, it, expect, vi } from 'vitest';
import { loadHandler, loadToast } from '../helpers/loader.js';

describe('FluentToast Bridge (integration)', () => {
  let FluentHttpAjaxify, FluentToast, mockAxios;

  beforeEach(async () => {
    const mod = await loadHandler();
    FluentHttpAjaxify = mod.FluentHttpAjaxify;
    mockAxios = mod.mockAxios;
    mockAxios.reset();
    FluentToast = await loadToast();
  });

  it('bridge() registers FluentToast as notifier on the api', () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    FluentToast.bridge(api);
    expect(api._notifierName).toBe('custom adapter');
  });

  it('bridge() subscribes to success events', async () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const successSpy = vi.spyOn(FluentToast, 'success');
    FluentToast.bridge(api);

    await api.get('/test').send();
    expect(successSpy).toHaveBeenCalled();
    successSpy.mockRestore();
  });

  it('bridge() subscribes to error events', async () => {
    mockAxios.enqueue(mockAxios.createError(500, {}, 'Server Error'));
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const errorSpy = vi.spyOn(FluentToast, 'error');
    FluentToast.bridge(api, { networkError: false, validation: false });

    await api.get('/fail').send();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('bridge() can disable specific event types', () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    const onSpy = vi.spyOn(api, 'on');
    FluentToast.bridge(api, { success: false, validation: false });

    const eventNames = onSpy.mock.calls.map(c => c[0]);
    expect(eventNames).not.toContain('success');
    expect(eventNames).not.toContain('validation');
    onSpy.mockRestore();
  });

  it('useNotifier() with FluentToast object works', () => {
    const api = new FluentHttpAjaxify({ baseURL: '' });
    api.useNotifier(FluentToast);
    expect(api._notifier).toBe(FluentToast);
    expect(api._notifierName).toBe('custom adapter');
  });
});
