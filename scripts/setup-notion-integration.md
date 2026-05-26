# Notion integration setup

Notion uses an internal integration token (no OAuth dance). The catch: the
integration only sees pages you explicitly share with it.

## 1. Create the integration
1. Go to https://www.notion.so/profile/integrations
2. **New integration**
   - Name: `Daily Dispatch`
   - Type: **Internal**
   - Associated workspace: your personal workspace
3. **Capabilities**: Read content, Read user information without email
4. Submit, then copy the **Internal Integration Secret** (starts with `secret_` or `ntn_`).

## 2. Share pages with the integration
The integration sees nothing until you connect it to pages.
1. Open your **Personal Home** page in Notion
2. **•••** menu (top right) → **Connections** → **Connect to** → **Daily Dispatch**
3. Child pages inherit access — so connecting a top-level page covers its subtree.

## 3. Store the secrets
```sh
cd worker
wrangler secret put NOTION_TOKEN
# Command Center page for the Phase 6 morning write-back:
wrangler secret put NOTION_DISPATCH_PAGE_ID
# value: 36bf83b2-c7e4-81ff-b330-fe53a9b557d6
```

---

# Todoist token

1. Go to https://app.todoist.com/app/settings/integrations/developer
2. Copy your **API token**
3. Store it:
```sh
cd worker
wrangler secret put TODOIST_TOKEN
```

---

# Anthropic API key (for the glance-sentence synthesis)

1. Go to https://console.anthropic.com
2. Create an API key labeled `daily-dispatch-worker`
3. **Set a $5/month spending cap** as a hard ceiling (Settings → Limits)
4. Store it:
```sh
cd worker
wrangler secret put ANTHROPIC_API_KEY
```

---

## Secret checklist (9 total)
After all consoles + dances are done, `wrangler secret list` should show:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`NOTION_TOKEN`, `NOTION_DISPATCH_PAGE_ID`, `TODOIST_TOKEN`,
`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`,
`ANTHROPIC_API_KEY`.

> Note: that's 10 names. The spec's "9 entries" predates splitting out
> `NOTION_DISPATCH_PAGE_ID`; the Worker's `Env` interface expects all of the above.
