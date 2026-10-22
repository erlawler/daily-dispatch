import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {apiResponse, providerFetch, UPSTREAM_TIMEOUT_MS} from '../src/http';
import {interactiveDashboard, RefreshCooldown} from '../src/interactive';
import {buildDashboard} from '../src/dashboard';
import worker, {type Env} from '../src/index';
// Pages deliberately uses plain JavaScript outside the Worker TypeScript project.
// @ts-expect-error No declaration is needed for this Pages entrypoint in production.
import {onRequest} from '../../functions/api/dashboard.js';

vi.mock('../src/dashboard', () => ({buildDashboard: vi.fn()}));
const build = vi.mocked(buildDashboard);
const payload = {glance: 'Fixture only', calendar: [], horizon: [], emails: [], tasks: [], notion: [], files: [], spotify: {playing: null, recent: []}, sources: {google: 'ok', notion: 'ok', todoist: 'ok', spotify: 'ok'}, generated_at: '2026-10-22T00:00:00Z'} as Awaited<ReturnType<typeof buildDashboard>>;
function environment() {
  const values = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const value = values.get(key) ?? null;
      return value && type === 'json' ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {values.set(key, value);}),
  };
  return {env: {TOKENS: kv, DISPATCH_KEY: 'fixture-shared-key'} as unknown as Env, values, kv};
}
beforeEach(() => {build.mockReset(); build.mockResolvedValue(payload);});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();});

describe('secret-bearing outbound requests', () => {
  it('rejects unapproved URLs before sending credentials', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const url of ['http://api.notion.com/v1/search', 'https://api.notion.com.attacker.test/', 'https://user@api.notion.com/', 'https://127.0.0.1/', 'https://api.notion.com:444/']) {
      await expect(providerFetch(url, {headers: {Authorization: 'Bearer fixture'}})).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never follows provider redirects and applies a bounded abort signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 307, headers: {Location: 'https://attacker.test'}}));
    vi.stubGlobal('fetch', fetcher);
    await expect(providerFetch('https://oauth2.googleapis.com/token', {method: 'POST', body: 'fixture', redirect: 'follow'})).rejects.toThrow('redirect');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({redirect: 'manual', signal: controller.signal});
    expect(timeout).toHaveBeenCalledWith(UPSTREAM_TIMEOUT_MS);
  });
  it('propagates timeout cancellation without retrying a paid or delivery request', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    vi.stubGlobal('fetch', fetcher);
    const request = providerFetch('https://api.anthropic.com/v1/messages');
    controller.abort();
    await expect(request).rejects.toThrow('aborted');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('interactive rebuild cost controls', () => {
  it('keeps normal cached loads and permits manual refresh again after the cooldown', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
    const {env, values} = environment();
    expect((await interactiveDashboard(env, false)).data).toEqual(payload);
    expect(values.has('dashboard_refresh_after')).toBe(true);
    expect((await interactiveDashboard(env, true)).cooldown).toBe(true);
    expect((await interactiveDashboard(env, false)).data).toEqual(payload);
    expect(build).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await interactiveDashboard(env, true);
    expect(build).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent requests in the same isolate', async () => {
    const {env} = environment();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    build.mockImplementation(async () => {await gate; return payload;});
    const requests = [interactiveDashboard(env, true), interactiveDashboard(env, true)];
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(build).toHaveBeenCalledTimes(1);
    release();
    expect(await Promise.all(requests)).toHaveLength(2);
  });
  it('fails closed during a shared cooldown or failed reservation with no cached payload', async () => {
    const first = environment(); first.values.set('dashboard_refresh_after', String(Date.now() + 60_000));
    await expect(interactiveDashboard(first.env, true)).rejects.toBeInstanceOf(RefreshCooldown);
    const second = environment(); second.kv.put.mockRejectedValue(new Error('sensitive fixture'));
    await expect(interactiveDashboard(second.env, true)).rejects.toThrow();
    expect(build).not.toHaveBeenCalled();
  });
});

describe('Worker API boundary', () => {
  const ctx = {waitUntil: vi.fn()} as unknown as ExecutionContext;
  it('restricts methods and refuses missing secrets before reading or building', async () => {
    const {env, kv} = environment();
    expect((await worker.fetch(new Request('https://worker.test/api/dashboard', {method: 'DELETE'}), env, ctx)).status).toBe(405);
    expect((await worker.fetch(new Request('https://worker.test/api/dashboard?refresh=1'), env, ctx)).status).toBe(405);
    expect((await worker.fetch(new Request('https://worker.test/api/dashboard'), env, ctx)).status).toBe(403);
    expect(kv.get).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled();
  });
  it('returns generic private errors without provider details', async () => {
    vi.stubGlobal('crypto', {subtle: {timingSafeEqual: (a: Uint8Array, b: Uint8Array) => a.every((value, i) => value === b[i])}});
    const {env} = environment(); build.mockRejectedValue(new Error('sensitive-provider-fixture'));
    const response = await worker.fetch(new Request('https://worker.test/api/dashboard', {headers: {'X-Dispatch-Key': env.DISPATCH_KEY}}), env, ctx);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive-provider-fixture');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('protects error and successful response headers consistently', () => {
    for (const status of [200, 403, 404, 405, 429, 503]) {
      const response = apiResponse({}, status);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    }
  });
});

describe('Pages proxy and frontend', () => {
  const env = {DISPATCH_KEY: 'fixture-shared-key'};
  it('blocks public alternate hosts, unsupported methods and cross-origin refresh', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const cases: [string, RequestInit, number][] = [
      ['https://preview.pages.dev/api/dashboard', {}, 403],
      ['https://dispatch.eric-lawler.com/api/dashboard', {method: 'DELETE'}, 405],
      ['https://dispatch.eric-lawler.com/api/dashboard?refresh=1', {}, 405],
      ['https://dispatch.eric-lawler.com/api/dashboard?refresh=1', {method: 'POST'}, 403],
      ['https://dispatch.eric-lawler.com/api/dashboard?refresh=1', {method: 'POST', headers: {Origin: 'https://attacker.test'}}, 403],
    ];
    for (const [url, init, status] of cases) expect((await onRequest({env, request: new Request(url, init)})).status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forwards only approved refresh, never browser headers or arbitrary query parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload, {headers: {'Retry-After': '60'}})); vi.stubGlobal('fetch', fetcher);
    const response = await onRequest({env, request: new Request('https://dispatch.eric-lawler.com/api/dashboard?refresh=1&target=attacker', {method: 'POST', headers: {Origin: 'https://dispatch.eric-lawler.com', 'X-Dispatch-Key': 'untrusted'}})});
    expect(response.status).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://daily-dispatch.ericlawler.workers.dev/api/dashboard?refresh=1');
    expect(fetcher.mock.calls[0][1]).toMatchObject({method: 'POST', redirect: 'manual', headers: {'X-Dispatch-Key': env.DISPATCH_KEY}});
    expect(fetcher.mock.calls[0][1].signal).toBeDefined();
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('retry-after')).toBe('60');
  });
  it('does not follow redirects or expose upstream exceptions', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('sensitive-upstream-fixture', {status: 302, headers: {Location: 'https://attacker.test'}})); vi.stubGlobal('fetch', fetcher);
    const request = new Request('https://dispatch.eric-lawler.com/api/dashboard');
    const response = await onRequest({env, request});
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('sensitive');
    fetcher.mockRejectedValue(new Error('sensitive-secret-fixture'));
    expect(await (await onRequest({env, request})).text()).not.toContain('sensitive');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
