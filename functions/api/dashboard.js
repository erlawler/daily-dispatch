// Access-gated Pages origin proxies requests using its server-only shared secret.
const DEFAULT_WORKER_URL = "https://daily-dispatch.ericlawler.workers.dev/api/dashboard";
const DEFAULT_ALLOWED_HOST = "dispatch.eric-lawler.com";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};
const error = (message, status, extra = {}) => new Response(JSON.stringify({error: message}), {status, headers: {...headers, ...extra}});

export async function onRequest({env, request}) {
  const url = new URL(request.url);
  if (url.hostname !== (env.ALLOWED_HOST || DEFAULT_ALLOWED_HOST)) return error("Forbidden", 403);
  const refresh = url.searchParams.get("refresh") === "1";
  if ((refresh && request.method !== "POST") || (!refresh && request.method !== "GET")) {
    return error("Method not allowed", 405, {Allow: refresh ? "POST" : "GET"});
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (refresh && request.headers.get("origin") !== url.origin)) {
    return error("Cross-site request rejected", 403);
  }
  if (!env.DISPATCH_KEY) return error("Dashboard unavailable", 503);
  try {
    // This URL is trusted deployment configuration, never a browser parameter.
    const target = new URL(env.WORKER_URL || DEFAULT_WORKER_URL);
    if (target.protocol !== "https:" || target.username || target.password || target.hash || target.search || target.pathname !== "/api/dashboard") {
      return error("Dashboard unavailable", 503);
    }
    if (refresh) target.searchParams.set("refresh", "1");
    const resp = await fetch(target, {
      method: refresh ? "POST" : "GET",
      headers: {"X-Dispatch-Key": env.DISPATCH_KEY},
      redirect: "manual", signal: AbortSignal.timeout(65_000),
    });
    const retryAfter = resp.headers.get("retry-after");
    const extra = /^\d{1,5}$/.test(retryAfter || "") ? {"Retry-After": retryAfter} : {};
    if (!resp.ok) {
      await resp.body?.cancel();
      return error(resp.status === 429 ? "Please wait a moment before refreshing again." : "Dashboard unavailable", resp.status === 429 ? 429 : 502, extra);
    }
    if (resp.headers.get("X-Dispatch-Refresh") === "cooldown") extra["X-Dispatch-Refresh"] = "cooldown";
    return new Response(resp.body, {status: resp.status, headers: {...headers, ...extra}});
  } catch {
    return error("Dashboard unavailable. Please retry shortly.", 502);
  }
}
