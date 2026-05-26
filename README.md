# The Daily Dispatch

A personal, single-page "morning briefing" that pulls my calendar, inbox, tasks,
notes, files, and now-playing into one calm, editorial dashboard — deployed to the
edge so it loads on **any device and any network**.

> Built as a weekend project to scratch a real itch, and to keep my hands on the
> full product loop: framing the problem, making build-vs-buy and architecture
> trade-offs, and shipping something end-to-end.

---

## The problem

My day's context lives in six different apps. First thing every morning I was
tab-hopping across Google Calendar, Gmail, Drive, Notion, Todoist, and Spotify just
to get oriented.

**Goal:** one URL I can bookmark anywhere that answers "what does today look like?"
in under five seconds — and that stays private to me.

## What it does

A newspaper-styled dashboard with six "departments," plus a one-line editorial
"glance" summary written by an LLM:

| Section | Source |
| --- | --- |
| The Schedule | Google Calendar — today's timed events |
| The Horizon | Google Calendar — next 7 days |
| Correspondence | Gmail — recent, non-promotional threads |
| Work Docket | Todoist — today + overdue |
| Field Notes | Notion — recently edited pages |
| The Archive | Google Drive — recently modified files |
| Marginalia | Spotify — now playing / recently played |
| "At a glance" | Claude Haiku — one calm sentence summarizing the day |

## Architecture

```
        Browser  ──HTTPS──▶  Cloudflare Access  (identity gate: my email only)
                                   │
                                   ▼
                       Cloudflare Pages
                       ├── static dashboard (HTML/CSS/JS)
                       └── Pages Function  /api/dashboard  (server-side proxy)
                                   │  + shared secret header
                                   ▼
                       Cloudflare Worker  /api/dashboard  (TypeScript)
                       ├── Google (Calendar · Gmail · Drive)
                       ├── Notion · Todoist · Spotify   (fetched in parallel)
                       ├── Claude Haiku  (the "glance" sentence)
                       └── KV  (cached OAuth access tokens)
```

The browser only ever talks to its **own origin**. A Pages Function proxies
`/api/dashboard` to the Worker server-side, attaching a shared secret. The Worker
fans out to every service in parallel, has each one **degrade gracefully** (a dead
service returns empty instead of failing the whole page), and returns a single JSON
payload the frontend renders.

## Key decisions & trade-offs

| Decision | Why |
| --- | --- |
| Cloudflare Workers + Pages | Free tier covers personal scale; runs at the edge; secrets + KV built in |
| Direct REST APIs, not MCP | MCP auth is tied to a chat session; native OAuth is the right fit for a standalone app |
| Pages Function as a proxy | Pages `_redirects` can't proxy to an external origin; the Function also lets one Access gate cover page + API |
| Synthesize only the "glance" | Keep LLM cost trivial (~$0.001/load) — format the rest deterministically client-side |
| Graceful per-service degradation | A flaky integration should never blank the whole briefing |

## Security model

Three independent layers, so my calendar/inbox/tasks are never publicly reachable:

1. **Cloudflare Access** gates the custom domain to a single identity (my email) —
   unauthenticated requests get bounced to a login.
2. **Pages Function** holds the shared secret server-side (never shipped to the
   browser) and refuses any hostname except the gated custom domain, so the public
   `*.pages.dev` URL can't be used as a bypass.
3. **Worker** rejects any request missing the secret header.

No credentials live in this repo — every token/secret is stored in Cloudflare
(Worker Secrets / Pages env), and `.gitignore` excludes `.env`/`.dev.vars`.

## Repo layout

```
daily-dispatch/
├── frontend/index.html        # the editorial dashboard (static)
├── functions/api/dashboard.js # Pages Function: server-side proxy + host lock
├── worker/                    # Cloudflare Worker (TypeScript)
│   └── src/
│       ├── index.ts           # /api/dashboard entry + secret guard
│       ├── auth.ts            # Google + Spotify OAuth token refresh (KV-cached)
│       ├── time.ts            # timezone-aware date helpers
│       ├── synthesize.ts      # the Haiku "glance" sentence
│       └── services/          # google · notion · todoist · spotify
└── scripts/                   # one-time OAuth / setup walkthroughs
```

## Running it yourself

```sh
cd worker
npm install
npm run typecheck
npm run dev        # local Worker on :8787
```

The frontend is any static host; point its `WORKER_URL` (or a same-origin proxy) at
the Worker. OAuth/app setup for each service is documented in `scripts/`.

## Tech

TypeScript · Cloudflare Workers, Pages & KV · Wrangler · Anthropic Claude (Haiku) ·
Google / Notion / Todoist / Spotify REST APIs · vanilla HTML/CSS/JS frontend
(Fraunces + Instrument Sans).
