// Pages Function: server-side proxy for /api/dashboard.
// Runs on the Pages origin (behind Cloudflare Access), forwards to the Worker
// with the shared secret header. The secret lives in Pages env (DISPATCH_KEY)
// and is never exposed to the browser.
const WORKER_URL = "https://daily-dispatch.ericlawler.workers.dev/api/dashboard";

// Data is only served on the Access-gated custom domain. The public *.pages.dev
// hostname (which Access can't protect) gets 403 here, so it can't bypass the gate.
const ALLOWED_HOST = "dispatch.eric-lawler.com";

export async function onRequestGet(context) {
  const { env, request } = context;
  if (new URL(request.url).hostname !== ALLOWED_HOST) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const resp = await fetch(WORKER_URL, {
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
