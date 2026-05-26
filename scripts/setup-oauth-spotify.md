# Spotify OAuth setup

## 1. Create the app
1. Go to https://developer.spotify.com/dashboard
2. **Create app**
   - App name: `Daily Dispatch`
   - App description: anything (e.g. "personal dashboard")
   - **Redirect URI**: `http://127.0.0.1:8787/oauth/spotify/callback`
   - APIs used: **Web API**
3. Save. Open the app → **Settings** → copy the **Client ID** and **Client Secret**.

## 2. Scopes
Requested by the script automatically:
- `user-read-currently-playing`
- `user-read-recently-played`
- `user-read-playback-state`

## 3. Run the refresh-token dance
From the repo root:
```sh
SPOTIFY_CLIENT_ID='<client id>' SPOTIFY_CLIENT_SECRET='<client secret>' \
  node scripts/get-spotify-refresh-token.mjs
```
A browser opens → grant consent → the script prints `SPOTIFY_REFRESH_TOKEN`.

## 4. Store the three secrets
```sh
cd worker
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
wrangler secret put SPOTIFY_REFRESH_TOKEN
```

> Spotify refresh tokens can rotate — the Worker's `auth.ts` checks each token
> response for a new `refresh_token` and updates KV when one is returned.
