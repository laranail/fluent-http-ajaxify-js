/**
 * Unit tests for ResponseProtocol improvements
 * Covers: per-section drawMode, confirm directive, emit event validation, flashShown tracking
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadHandler } from '../helpers/loader.js';

describe('ResponseProtocol', () => {
  let FluentHttpAjaxify, mockAxios;

  beforeEach(async () => {
    const mod = await loadHandler();
    FluentHttpAjaxify = mod.FluentHttpAjaxify;
    mockAxios = mod.mockAxios;
  });

  it('handles flat string sections (legacy format)', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    const data = {
      success: true,
      sections: { '#list': '<ul><li>Item</li></ul>' },
    };

    // Access ResponseProtocol via the static
    const result = FluentHttpAjaxify.ResponseProtocol.process(data, api);
    expect(result.handled).toBe(true);
  });

  it('handles per-section drawMode objects', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    const data = {
      success: true,
      sections: {
        '#list': { html: '<ul>List</ul>', mode: 'redraw' },
        '#sidebar': { html: '<div>Side</div>', mode: 'append' },
      },
    };

    const result = FluentHttpAjaxify.ResponseProtocol.process(data, api);
    expect(result.handled).toBe(true);
  });

  it('returns flashShown=true when flash messages are processed', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    api.useNotifier({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    });

    const data = {
      success: true,
      flash: [{ type: 'success', message: 'Saved!' }],
    };

    const result = FluentHttpAjaxify.ResponseProtocol.process(data, api);
    expect(result.flashShown).toBe(true);
    expect(api._notifier.success).toHaveBeenCalledWith('Saved!', undefined);
  });

  it('returns flashShown=false when autoFlash is disabled', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    api.useNotifier({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    });

    const data = {
      success: true,
      flash: [{ type: 'success', message: 'Saved!' }],
    };

    const result = FluentHttpAjaxify.ResponseProtocol.process(data, api, { autoFlash: false });
    expect(result.flashShown).toBe(false);
    expect(api._notifier.success).not.toHaveBeenCalled();
  });

  it('validates emit event names — rejects unsafe patterns', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

    const data = {
      success: true,
      emit: {
        'valid.event': { id: 1 },
        '<script>alert(1)</script>': 'bad',
        'also-valid:name': 'ok',
      },
    };

    FluentHttpAjaxify.ResponseProtocol.process(data, api);

    // Only valid events should be dispatched
    const calls = dispatchSpy.mock.calls;
    const eventNames = calls.map(c => c[0].type);
    expect(eventNames).toContain('fluent:valid.event');
    expect(eventNames).toContain('fluent:also-valid:name');
    expect(eventNames).not.toContain('fluent:<script>alert(1)</script>');

    dispatchSpy.mockRestore();
  });

  it('handles confirm directive with window.confirm fallback', () => {
    const api = new FluentHttpAjaxify({ baseURL: '/api', protocol: { enabled: true } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const data = {
      success: true,
      confirm: 'Are you sure?',
    };

    FluentHttpAjaxify.ResponseProtocol.process(data, api);
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure?');

    confirmSpy.mockRestore();
  });

  it('isProtocolResponse detects valid protocol envelopes', () => {
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse({ success: true })).toBe(true);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse({ redirect: '/home' })).toBe(true);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse({ flash: [] })).toBe(true);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse({ sections: {} })).toBe(true);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse({ name: 'John' })).toBe(false);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse(null)).toBe(false);
    expect(FluentHttpAjaxify.ResponseProtocol.isProtocolResponse('string')).toBe(false);
  });
});
