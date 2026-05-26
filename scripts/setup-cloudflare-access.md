# Cloudflare Access setup (gate the dashboard to just you)

This is the final privacy step. The API is already locked down server-side
(the Worker 403s anyone without the shared secret, which only the Pages
Function holds). Access gates the **Pages domain** itself — the page *and*
the `/api/dashboard` Function — so only you can load the dashboard.

You do this in the Cloudflare dashboard (it loads fine for you; it just
wouldn't render in the automated browser session).

## 1. Open Zero Trust
- Go to https://dash.cloudflare.com → **Zero Trust** (left sidebar).
- First time only: pick a **team name** (becomes `<team>.cloudflareaccess.com`,
  your Access login domain). `ericlawler` is a fine choice.
- Choose the **Free** plan. It may ask for a payment method to activate — the
  Access free tier covers up to 50 users at **$0**; you won't be charged.

## 2. Add a self-hosted application
- **Access → Applications → Add an application → Self-hosted**.
- **Application name**: `Daily Dispatch`
- **Session duration**: `1 month` (so you're not logging in constantly).
- **Public hostname**: subdomain `daily-dispatch`, domain `pages.dev`
  → i.e. `daily-dispatch.pages.dev`.
- Save / Next.

## 3. Add a policy
- **Policy name**: `Only Eric`
- **Action**: Allow
- **Include** → **Emails** → `your-email@example.com`
- Save. (Login method: one-time PIN to that email works out of the box; or add
  Google as an identity provider if you prefer one-click.)

## 4. Done — verify
- Open `https://daily-dispatch.pages.dev` in a fresh/incognito window. You should
  hit a Cloudflare Access login (enter your email → one-time PIN) before the
  dashboard loads.
- Anyone without that email is blocked at Cloudflare's edge, for both the page
  and `/api/dashboard`.

## How the layers fit together
- **Cloudflare Access** → gates `daily-dispatch.pages.dev` (page + Function) by identity.
- **Pages Function** (`functions/api/dashboard.js`) → server-side proxy; holds the
  shared secret, never exposes it to the browser.
- **Worker** (`X-Dispatch-Key` check) → refuses any request without the secret, so
  it can't be called directly even if someone learns its URL.
