/**
 * FluentHttpAjaxify v3.0.0 — TypeScript Definitions
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════════════════
// Debug Types
// ═══════════════════════════════════════════════════════════════════════════

/** Debug log level. Higher levels include all lower levels. */
export type DebugLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose';

// ═══════════════════════════════════════════════════════════════════════════
// Core Response Types
// ═══════════════════════════════════════════════════════════════════════════

/** Structured error object returned on failed requests. */
export interface FluentHttpError {
  /** HTTP status code, `0` for network errors, `-1` for config errors. */
  status: number;
  /** Human-readable error message. */
  message: string;
  /** Validation errors (e.g. Laravel's `{ field: ['message'] }`). */
  errors: Record<string, string[]>;
  /** The original Axios error. */
  raw: Error | null;
}

/** Consistent return shape from every `.send()` call. */
export interface FluentHttpResponse<T = any> {
  /** Response payload, or `null` on failure. */
  data: T | null;
  /** Structured error, or `null` on success. */
  error: FluentHttpError | null;
  /** HTTP status code (`0` = network error, `-1` = config/reuse error). */
  status: number;
}

/** Paginated response shape. */
export interface FluentHttpPaginatedResponse<T = any> {
  data: T[];
  error: FluentHttpError | null;
  status: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Option Interfaces
// ═══════════════════════════════════════════════════════════════════════════

/** Options for the `.paginate()` method. */
export interface PaginateOptions<T = any> {
  pageParam?: string;
  limitParam?: string;
  limit?: number;
  startPage?: number;
  onPage?: (items: T[], page: number, rawResponse: any) => void;
  maxPages?: number;
}

/** Options for the `.retry()` method. */
export interface RetryOptions {
  exponential?: boolean;
}

/** Smart auto-init configuration. */
export interface SmartConfig {
  /** Auto-read meta tags on DOMContentLoaded. Default: `true`. */
  autoInit?: boolean;
  /** Auto-bind `data-fluent-*` forms. Default: `true`. */
  autoBindForms?: boolean;
  /** Auto-detect toast library on window.load. Default: `true`. */
  autoNotifier?: boolean;
  /** Window property name for auto-instance. Default: `'FluentHttp'`. */
  globalName?: string;
  /** Prefix for meta tag names. Default: `''`. */
  metaPrefix?: string;
}

/** Security configuration options (v3.0.0). */
export interface SecurityConfig {
  /** CSRF header name. Default: `'X-CSRF-TOKEN'`. */
  csrfHeaderName?: string;
  /** Enforce HTTPS-only requests. Default: `false`. */
  requireHttps?: boolean;
  /** Allow server-sent JavaScript execution. Default: `false`. */
  allowServerEval?: boolean;
  /** Allowed origins for requests. */
  allowedOrigins?: string[];
  /** Max request body size in bytes. */
  maxRequestBodySize?: number;
  /** Max response size in bytes. */
  maxResponseSize?: number;
  /** Section HTML sanitization mode. */
  sectionSanitize?: 'strict' | 'basic' | 'none';
}

/** Protocol processing options. */
export interface ProtocolOptions {
  autoRedirect?: boolean;
  autoFlash?: boolean;
  autoAlert?: boolean;
  autoSections?: boolean;
  autoScrollTo?: boolean;
  autoDump?: boolean;
}

/** Config object for the constructor and `.create()` factory. */
export interface FluentHttpConfig {
  baseURL?: string;
  csrf?: string;
  token?: string;
  tokenScheme?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  /** Debug level: `true` → 'info', `false` → 'silent', or a log level string. */
  debug?: boolean | DebugLevel;
  offline?: boolean;
  concurrency?: number;
  /** Max history entries. `0` = disabled. */
  history?: number;
  /** Smart auto-init overrides. */
  smart?: SmartConfig;
  /** Security hardening options (v3.0.0). */
  security?: SecurityConfig;
  /** Protocol processing options. */
  protocol?: boolean | ProtocolOptions;
}

/** @deprecated Use `FluentHttpConfig` instead. */
export type CreateOptions = FluentHttpConfig;

/** Notification adapter interface. */
export interface NotifierAdapter {
  success(message: string, title?: string): void;
  error(message: string, title?: string): void;
  warning(message: string, title?: string): void;
  info(message: string, title?: string): void;
}

/** Supported notification driver names. */
export type NotifierDriver = 'toastr' | 'sweetalert2' | 'notyf' | 'izitoast' | 'console' | 'auto' | 'builtin';

/** Options for `.autoNotify()`. */
export interface AutoNotifyOptions {
  /** Toast on every success. `true` = default message, `string` = custom. */
  success?: boolean | string;
  /** Toast on every error. */
  error?: boolean | string;
  /** Toast summary on 422 validation. */
  validation?: boolean | string;
  /** Toast on network errors. */
  networkError?: boolean | string;
}

/** Options for per-request `.notify()`. */
export type RequestNotifyOptions = boolean | {
  success?: string;
  error?: string;
};

/** CSS framework detection result. */
export interface CssFrameworkConfig {
  errorClass: string;
  messageClass: string;
  messageTag: string;
  parentClass: string;
}

/** Options for `.bindForm()`. */
export interface FormBindOptions {
  action?: string;
  method?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: FluentHttpError) => void;
  /** Callback for 422 validation errors specifically. */
  onValidationError?: (errors: Record<string, string[]>, fullError: FluentHttpError) => void;
  /** Async-compatible hook before submit. Return `false` to cancel. */
  onBeforeSubmit?: (form: HTMLFormElement) => boolean | Promise<boolean>;
  resetOnSuccess?: boolean;
  disableOnSubmit?: boolean;
  errorClass?: string;
  errorTag?: string;
  successMessage?: string;
  confirm?: string;
  /** CSS class applied to form during submission. */
  loadingClass?: string;
  /** Auto-scroll to first invalid field on 422. */
  scrollToErrors?: boolean;
  /** CSS framework for error display. */
  cssFramework?: 'auto' | 'bootstrap3' | 'bootstrap4' | 'bootstrap5' | 'tailwind' | 'bulma' | 'custom';
  /** CSS selector or element for file upload progress display. */
  progressTarget?: string | HTMLElement;
}

/** Request history entry. */
export interface HistoryEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  error?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook Payloads
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestHookPayload {
  method: string;
  url: string;
  params: Record<string, any>;
  headers: Record<string, string>;
  body: any;
}

export interface ResponseHookPayload {
  method: string;
  url: string;
  status: number;
  duration: number;
  data?: any;
  error?: FluentHttpError;
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Types
// ═══════════════════════════════════════════════════════════════════════════

/** All supported event names and their payload types. */
export interface FluentHttpEventMap {
  'success':          { data: any; response: any; status: number };
  'error':            { error: FluentHttpError; status: number };
  'error:network':    { error: FluentHttpError };
  'error:timeout':    { error: FluentHttpError };
  'error:cancelled':  { error: FluentHttpError };
  'validation':       { errors: Record<string, string[]>; message: string; status: 422 };
  'start':            { method: string; url: string };
  'complete':         { method: string; url: string; status: number; duration: number };
  'request':          RequestHookPayload;
  'response':         ResponseHookPayload;
  'retry':            { attempt: number; maxAttempts: number; delay: number; error: FluentHttpError };
  'offline:queued':   { method: string; url: string };
  'protocol:flash':     any[];
  'protocol:alert':     string;
  'protocol:section':   Record<string, string>;
  'protocol:scrollTo':  string;
  'protocol:dump':      any;
  'protocol:closeModal': any;
  'protocol:resetForm':  any;
  'protocol:emit':      Record<string, any>;
  'protocol:script':    string;
  'protocol:redirect':  string;
  'protocol:confirm':   string;
  [key: `error:${number}`]: { error: FluentHttpError };
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export interface RegistrationObject {
  config: {
    http: {
      baseURL: string;
      timeout: number;
      tokenScheme: string;
      defaultHeaders: Record<string, string>;
      csrf: string | null;
    };
    features: {
      debug: boolean;
      offline: boolean;
      concurrency: number;
      history: number;
    };
    smart: Required<SmartConfig>;
  };
  metadata: {
    name: string;
    version: string;
    type: string;
    description: string;
    authors: Array<{ name: string }>;
    dependencies: string[];
    tags: string[];
    stable: boolean;
  };
  messages: {
    info: Record<string, string>;
    error: Record<string, string>;
  };
}

/** Mock route map — keys are endpoints or `'METHOD:/endpoint'`. */
export type MockRouteMap = Record<
  string,
  any | ((params: Record<string, any>, body: any) => any)
>;

// ═══════════════════════════════════════════════════════════════════════════
// Middleware Types
// ═══════════════════════════════════════════════════════════════════════════

/** Middleware config object passed through the pipeline. */
export interface MiddlewareConfig {
  method: string;
  url: string;
  params: Record<string, any>;
  headers: Record<string, string>;
  data: any;
  [key: string]: any;
}

/** Middleware function signature: `(next) => async (config) => result`. */
export type MiddlewareFn = (
  next: (config: MiddlewareConfig) => Promise<FluentHttpResponse>
) => (config: MiddlewareConfig) => Promise<FluentHttpResponse>;

/** Entry in a MiddlewareStack. */
export interface MiddlewareEntry {
  fn: MiddlewareFn;
  name: string | null;
}

/** Composable middleware stack with named entries. */
export declare class MiddlewareStack {
  /** Number of middleware in the stack. */
  readonly length: number;
  /** Add middleware to the end. */
  push(fn: MiddlewareFn, name?: string): this;
  /** Add middleware to the beginning. */
  unshift(fn: MiddlewareFn, name?: string): this;
  /** Insert middleware before a named entry. */
  before(target: string, fn: MiddlewareFn, name?: string): this;
  /** Insert middleware after a named entry. */
  after(target: string, fn: MiddlewareFn, name?: string): this;
  /** Remove a named middleware. */
  remove(name: string): this;
  /** Check if a named middleware exists. */
  has(name: string): boolean;
  /** Compose all middleware around a core handler. */
  resolve(
    handler: (config: MiddlewareConfig) => Promise<FluentHttpResponse>
  ): (config: MiddlewareConfig) => Promise<FluentHttpResponse>;
  /** List all entries. */
  list(): MiddlewareEntry[];
  /** Create an independent copy. */
  clone(): MiddlewareStack;
}

/** Validation rules — Laravel-style string rules or custom function. */
export type ValidationRule = string | ((value: any) => boolean);
export type ValidationRules = Record<string, ValidationRule>;

/** Options for Middleware.retry(). */
export interface MiddlewareRetryOptions {
  attempts?: number;
  delay?: number;
  exponential?: boolean;
  retryOn?: (result: FluentHttpResponse) => boolean;
}

/** Options for Middleware.cache(). */
export interface MiddlewareCacheOptions {
  ttl?: number;
  store?: { get(key: string): any; set(key: string, value: any): void };
}

/** Options for Middleware.rateLimit(). */
export interface MiddlewareRateLimitOptions {
  max?: number;
  windowMs?: number;
}

/** Built-in middleware factory methods. */
export interface MiddlewareStatic {
  /** Client-side validation with Laravel-style string rules. */
  validation(rules: ValidationRules): MiddlewareFn;
  /** Retry failed requests with backoff. */
  retry(opts?: MiddlewareRetryOptions): MiddlewareFn;
  /** Dynamic auth token injection. */
  auth(tokenOrFn: string | (() => string | Promise<string>), scheme?: string): MiddlewareFn;
  /** Request/response lifecycle logging. */
  logging(logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void }): MiddlewareFn;
  /** In-memory GET cache with TTL. */
  cache(opts?: MiddlewareCacheOptions): MiddlewareFn;
  /** Deduplicate identical in-flight GET requests. */
  dedup(): MiddlewareFn;
  /** Record request/response history. */
  history(container: any[]): MiddlewareFn;
  /** Mock responses (FIFO queue or function). */
  mock(responses: any[] | ((config: MiddlewareConfig) => FluentHttpResponse)): MiddlewareFn;
  /** Transform config before sending. */
  mapRequest(fn: (config: MiddlewareConfig) => MiddlewareConfig): MiddlewareFn;
  /** Transform result after response. */
  mapResponse(fn: (result: FluentHttpResponse) => FluentHttpResponse): MiddlewareFn;
  /** Rate limit requests. */
  rateLimit(opts?: MiddlewareRateLimitOptions): MiddlewareFn;
  /** Block requests failing a predicate. */
  guard(predicate: (config: MiddlewareConfig) => boolean): MiddlewareFn;
  /** Override timeout per-middleware. */
  timeout(ms: number): MiddlewareFn;
  /** Transform error objects. */
  transformError(fn: (error: FluentHttpError) => FluentHttpError): MiddlewareFn;
}

export declare const Middleware: MiddlewareStatic;

// ═══════════════════════════════════════════════════════════════════════════
// FluentToast Types
// ═══════════════════════════════════════════════════════════════════════════

/** FluentToast position. */
export type ToastPosition =
  | 'top-right' | 'top-left' | 'top-center'
  | 'bottom-right' | 'bottom-left' | 'bottom-center';

/** FluentToast configuration options. */
export interface FluentToastConfig {
  position?: ToastPosition;
  maxToasts?: number;
  newestOnTop?: boolean;
  pauseOnHover?: boolean;
  progressBar?: boolean;
  duration?: {
    success?: number;
    error?: number;
    warning?: number;
    info?: number;
  };
  /** CSP nonce for injected style tags. */
  nonce?: string;
  /** Set to `false` to skip CSS injection (use external stylesheet). */
  styles?: boolean;
  /** Custom CSS class added to all toast elements. */
  customClass?: string;
}

/** FluentToast standalone module. */
export interface FluentToastModule extends NotifierAdapter {
  configure(opts: FluentToastConfig): FluentToastModule;
  getConfig(): FluentToastConfig;
  bridge(api: FluentHttpAjaxify, opts?: Partial<AutoNotifyOptions>): FluentToastModule;
  dismissAll(): FluentToastModule;
  detectLibrary(): string;
  escapeHtml(str: string): string;
  createAdapter(driver: NotifierDriver | NotifierAdapter): NotifierAdapter;
  useAdapter(adapter: NotifierAdapter): FluentToastModule;
  NotificationAdapter: { create(driver: NotifierDriver | NotifierAdapter): NotifierAdapter };
}

// ═══════════════════════════════════════════════════════════════════════════
// RequestBuilder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chainable request builder. Created by `FluentHttpAjaxify` instance
 * methods. Do not instantiate directly.
 */
export declare class RequestBuilder<T = any> {
  // ── Auth & Headers ─────────────────────────────────────────────────
  withToken(token: string, scheme?: string): this;
  withCsrf(token: string): this;
  withBody(data: any): this;
  withHeader(key: string, value: string): this;
  withHeaders(headers: Record<string, string>): this;
  withParam(key: string, value: any): this;
  withParams(params: Record<string, any>): this;
  withFile(fieldName: string, file: File | Blob): this;
  withFiles(files: FormData | Record<string, File | Blob>): this;

  // ── Request Config ─────────────────────────────────────────────────
  cancelWith(controller: AbortController): this;
  abortable(): AbortController;
  retry(attempts?: number, delayMs?: number, options?: RetryOptions): this;
  cache(ttlSeconds: number): this;
  withTimeout(ms: number): this;
  /** Merge arbitrary Axios config options (escape hatch). */
  withOptions(opts: Record<string, any>): this;
  /** Send as POST with `X-HTTP-Method-Override` header. */
  withMethodOverride(): this;

  // ── Response Type ──────────────────────────────────────────────────
  asBlob(): this;
  asText(): this;
  asArrayBuffer(): this;
  asStream(): this;
  /** Set Accept header to `application/json`. */
  asJson(): this;
  /** Set Accept header to `text/html`. */
  asHtml(): this;
  /** Set Accept header to `*\/*`. */
  asAny(): this;

  // ── Callbacks (backward compat) ────────────────────────────────────
  onSuccess(fn: (data: T, response: any) => void): this;
  onError(fn: (error: FluentHttpError) => void): this;
  onFinally(fn: () => void): this;
  onProgress(fn: (percent: number) => void): this;

  // ── Per-Request Events ─────────────────────────────────────────────
  /** Register a per-request event listener. */
  on<K extends keyof FluentHttpEventMap>(event: K, fn: (payload: FluentHttpEventMap[K]) => void): this;
  on(event: string, fn: (payload: any) => void): this;
  /** Register a one-shot per-request event listener. */
  once<K extends keyof FluentHttpEventMap>(event: K, fn: (payload: FluentHttpEventMap[K]) => void): this;
  once(event: string, fn: (payload: any) => void): this;
  /** Shorthand for `.on('start', fn)`. */
  onStart(fn: (payload: { method: string; url: string }) => void): this;
  /** Shorthand for `.on('complete', fn)`. */
  onComplete(fn: (payload: { method: string; url: string; status: number; duration: number }) => void): this;

  // ── Notification ───────────────────────────────────────────────────
  /** Enable toast notifications for this request. */
  notify(opts?: RequestNotifyOptions): this;
  /** Suppress protocol flash message processing for this request. */
  withoutProtocolFlash(): this;

  // ── Convenience Methods ───────────────────────────────────────────
  /** Enable cross-origin cookie/credential sending. */
  withCredentials(): this;
  /** Enable protocol processing for this specific request. */
  withProtocol(opts?: ProtocolOptions): this;
  /** Set Content-Type to `application/x-www-form-urlencoded`. */
  asFormEncoded(): this;
  /** Configure as file download; optional auto-trigger with filename. */
  download(filename?: string): this;

  // ── Per-Request Middleware ────────────────────────────────────────
  /** Add per-request middleware. */
  use(middleware: MiddlewareFn, name?: string): this;
  /** Get the per-request middleware stack (null if none added). */
  getMiddleware(): MiddlewareStack | null;

  // ── Clone & Inspect ───────────────────────────────────────────────
  /** Clone this builder into a new unsent copy (copies middleware). */
  clone(): RequestBuilder<T>;
  /** Print the builder's configuration to the console without executing. */
  inspect(): this;

  // ── Execute ────────────────────────────────────────────────────────
  paginate<U = any>(options?: PaginateOptions<U>): Promise<FluentHttpPaginatedResponse<U>>;
  send(): Promise<FluentHttpResponse<T>>;
  then<TResult1 = FluentHttpResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: FluentHttpResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FluentHttpAjaxify
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fluent, chainable HTTP client built on Axios.
 *
 * @example
 * const api = new FluentHttpAjaxify({ baseURL: '/api', debug: true });
 * const { data, error } = await api.get('/users').send();
 */
declare class FluentHttpAjaxify {
  constructor(config?: FluentHttpConfig);

  // ── Static Methods ─────────────────────────────────────────────────
  static create(baseURL?: string, options?: FluentHttpConfig): FluentHttpAjaxify;
  static formatError(error: Error): FluentHttpError;
  static isOnline(): boolean;
  static getRegistration(): RegistrationObject;
  /** Deferred callback queue — runs `fn(api)` after auto-init completes. */
  static ready(fn: (api: FluentHttpAjaxify) => void): void;

  // ── Security Utilities (static) ───────────────────────────────────────
  /** Escape HTML entities in a string. */
  static escapeHtml(str: string): string;
  /** Sanitize a URL — blocks javascript:, data:, vbscript: schemes and HTML chars. */
  static sanitizeUrl(url: string): string;
  /** Sanitize HTML content with configurable strictness. */
  static sanitizeHtml(html: string, mode?: 'strict' | 'basic' | 'none'): string;
  /** Prototype-pollution-safe Object.assign replacement. */
  static safeAssign<T extends object>(target: T, ...sources: any[]): T;
  /** Convert dot-notation field name to bracket notation. */
  static sanitizeFieldName(name: string): string;
  /** Extract the first error message from any response shape. */
  static extractSingleError(response: any): string | null;
  /** Detect CSS framework for validation error display. */
  static detectCssFramework(configured?: string): CssFrameworkConfig;
  /** Client-side response protocol processor. */
  static ResponseProtocol: {
    isProtocolResponse(data: any): boolean;
    process(data: any, client: FluentHttpAjaxify, opts?: ProtocolOptions): { handled: boolean; data: any; flashShown: boolean };
  };

  // ── Global Configuration (chainable) ──────────────────────────────
  withCsrf(token: string): this;
  withToken(token: string, scheme?: string): this;
  withDefaultHeaders(headers: Record<string, string>): this;
  withConcurrency(n: number): this;
  /** Set the debug log level. `true` → 'info', `false` → 'silent'. */
  debug(level?: boolean | DebugLevel): this;
  /** Print a structured snapshot of the instance state to the console. */
  dump(): this;

  // ── Global Hooks (backward compat, chainable) ─────────────────────
  onSuccess(fn: (data: any, response: any) => void): this;
  onError(fn: (error: FluentHttpError) => void): this;
  onUnauthorized(fn: (error: FluentHttpError) => Promise<void>): this;
  onRequest(fn: (payload: RequestHookPayload) => void): this;
  onResponse(fn: (payload: ResponseHookPayload) => void): this;

  // ── Instance-Level Events ──────────────────────────────────────────
  /** Register an instance-level event listener (fires for ALL requests). */
  on<K extends keyof FluentHttpEventMap>(event: K, fn: (payload: FluentHttpEventMap[K]) => void): this;
  on(event: string, fn: (payload: any) => void): this;
  /** Register a one-shot instance-level event listener. */
  once<K extends keyof FluentHttpEventMap>(event: K, fn: (payload: FluentHttpEventMap[K]) => void): this;
  once(event: string, fn: (payload: any) => void): this;
  /** Remove an instance-level event listener. Omit `fn` to remove all. */
  off<K extends keyof FluentHttpEventMap>(event: K, fn?: (payload: FluentHttpEventMap[K]) => void): this;
  off(event: string, fn?: (payload: any) => void): this;
  /** Manually emit an event on this instance. */
  emit<K extends keyof FluentHttpEventMap>(event: K, payload?: FluentHttpEventMap[K]): this;
  emit(event: string, payload?: any): this;

  // ── Notification ───────────────────────────────────────────────────
  /** Set the notification adapter. */
  useNotifier(driver: NotifierDriver | NotifierAdapter): this;
  /** Get the instance-level middleware stack. */
  getMiddleware(): MiddlewareStack;
  /** Configure global auto-notification behavior. */
  autoNotify(opts: AutoNotifyOptions): this;
  /** Replace the global success handler. */
  setSuccessHandler(fn: (data: any, response: any, duration: number) => void): this;
  /** Replace the global error handler. */
  setErrorHandler(fn: (formatted: FluentHttpError, duration: number) => void): this;

  // ── CSRF (v3.0.0) ───────────────────────────────────────────────
  /** Set the CSRF cookie name for double-submit pattern. */
  withCsrfCookie(cookieName: string): this;
  /** Set the CSRF header name. */
  withCsrfHeader(headerName: string): this;
  /** Register a handler for 419 CSRF mismatch. */
  onCsrfMismatch(fn: () => Promise<void>): this;

  // ── Form Binding ───────────────────────────────────────────────────
  /** Bind a form for AJAX submission with 422 error display. */
  bindForm(selector: string | HTMLFormElement, options?: FormBindOptions): this;

  // ── Mock Mode ─────────────────────────────────────────────────────
  mock(routeMap: MockRouteMap | null): this;

  // ── Cache & History ────────────────────────────────────────────────
  clearCache(): this;
  /** Get a copy of the request history log. */
  getHistory(): HistoryEntry[];
  /** Clear the request history log. */
  clearHistory(): this;

  // ── Request Methods ───────────────────────────────────────────────
  get<T = any>(endpoint: string, params?: Record<string, any>): RequestBuilder<T>;
  post<T = any>(endpoint: string, data?: any): RequestBuilder<T>;
  put<T = any>(endpoint: string, data?: any): RequestBuilder<T>;
  patch<T = any>(endpoint: string, data?: any): RequestBuilder<T>;
  delete<T = any>(endpoint: string, data?: any): RequestBuilder<T>;
  upload<T = any>(endpoint: string, formData: FormData): RequestBuilder<T>;
  /** Start a HEAD request builder. */
  head<T = any>(endpoint: string, params?: Record<string, any>): RequestBuilder<T>;
  /** Start an OPTIONS request builder. */
  options<T = any>(endpoint: string): RequestBuilder<T>;

  // ── Batch ─────────────────────────────────────────────────────────
  /** Execute multiple request builders in parallel. */
  batch<T = any>(builders: RequestBuilder<T>[]): Promise<FluentHttpResponse<T>[]>;

  // ── Static Middleware Access ───────────────────────────────────────
  static Middleware: MiddlewareStatic;
  static MiddlewareStack: typeof MiddlewareStack;
}

export default FluentHttpAjaxify;

// UMD global declaration
declare global {
  interface Window {
    FluentHttpAjaxify: typeof FluentHttpAjaxify;
    /** Auto-created instance when `<meta name="api-base-url">` is present. */
    FluentHttp: FluentHttpAjaxify;
    /** Standalone toast module (if FluentToast.js is loaded). */
    FluentToast?: FluentToastModule;
  }
}
