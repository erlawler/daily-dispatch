# Google OAuth setup (Calendar + Gmail + Drive)

One Google OAuth client covers all three APIs — they share a single consent screen.

## 1. Create a project
1. Go to https://console.cloud.google.com
2. Project picker (top bar) → **New Project**
3. Name: `daily-dispatch` → **Create**, then select it.

## 2. Enable the APIs
APIs & Services → **Library**, then enable each:
- **Google Calendar API**
- **Gmail API**
- **Google Drive API**

## 3. Configure the OAuth consent screen
APIs & Services → **OAuth consent screen**
- User type: **External** → Create
- App name: `Daily Dispatch`, support email: your address
- **Scopes** → Add manually:
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/drive.readonly`
- **Test users** → add `your-email@example.com`
- Save. (Leave the app in "Testing" — no verification needed for personal use. A test-user refresh token from a Testing app can expire after 7 days; if it does, re-run the script or click "Publish app" to Production.)

## 4. Create the OAuth client
APIs & Services → **Credentials** → Create Credentials → **OAuth client ID**
- Application type: **Web application**
- Name: `daily-dispatch-web`
- **Authorized redirect URIs**: `http://localhost:8787/oauth/google/callback`
- Create. Copy the **Client ID** and **Client Secret**.

## 5. Run the refresh-token dance
From the repo root:
```sh
GOOGLE_CLIENT_ID='<client id>' GOOGLE_CLIENT_SECRET='<client secret>' \
  node scripts/get-google-refresh-token.mjs
```
A browser opens → grant consent → the script prints `GOOGLE_REFRESH_TOKEN`.

> If it says "No refresh token returned", revoke the app at
> https://myaccount.google.com/permissions and run the script again (it forces
> `prompt=consent` + `access_type=offline`, so a fresh run should yield one).

## 6. Store the three secrets
```sh
cd worker
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
```
