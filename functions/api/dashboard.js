// Pages Function: server-side proxy for /api/dashboard.
// Runs on the Pages origin (behind Cloudflare Access), forwards to the Worker
// with the shared secret header. The secret lives in Pages env (DISPATCH_KEY)
// and is never exposed to the browser.
//
// WORKER_URL and ALLOWED_HOST can be overridden in the Pages environment; the
// defaults below keep this deployment working when they are unset.
const DEFAULT_WORKER_URL = "https://daily-dispatch.ericlawler.workers.dev/api/dashboard";
const DEFAULT_ALLOWED_HOST = "dispatch.eric-lawler.com";

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // Data is only served on the Access-gated custom domain. The public *.pages.dev
  // hostname (which Access can't protect) gets 403 here, so it can't bypass the gate.
  if (url.hostname !== (env.ALLOWED_HOST || DEFAULT_ALLOWED_HOST)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Forward the refresh flag and nothing else. It is the only parameter the Worker
  // reads, and copying the query string wholesale would let a caller shape the
  // upstream URL.
  const target = new URL(env.WORKER_URL || DEFAULT_WORKER_URL);
  if (url.searchParams.get("refresh") === "1") {
    target.searchParams.set("refresh", "1");
  }

  try {
    const resp = await fetch(target, {
      headers: { "X-Dispatch-Key": env.DISPATCH_KEY || "" },
    });
    return new Response(resp.body, {
      status: resp.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
