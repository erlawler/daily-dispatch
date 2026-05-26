#!/usr/bin/env node
// One-time Spotify OAuth dance to obtain a refresh token.
//
// Usage:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-spotify-refresh-token.mjs
// or run with no env vars and paste the values when prompted.
//
// Opens your browser, you grant consent, the script prints the refresh token.
// No npm dependencies — uses only Node built-ins.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { exec } from 'node:child_process';

const PORT = 8787;
// Spotify rejects http://localhost; the loopback IP literal 127.0.0.1 is required.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth/spotify/callback`;
const SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-read-playback-state',
];

async function prompt(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

const clientId = process.env.SPOTIFY_CLIENT_ID || (await prompt('Spotify Client ID: '));
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || (await prompt('Spotify Client Secret: '));

if (!clientId || !clientSecret) {
  console.error('Both Client ID and Client Secret are required.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
  }).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth/spotify/callback') {
    res.writeHead(404).end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400).end(`Authorization failed: ${error}`);
    console.error(`\nAuthorization failed: ${error}`);
    server.close();
    process.exit(1);
  }
  if (returnedState !== state) {
    res.writeHead(400).end('State mismatch — possible CSRF. Aborting.');
    console.error('\nState mismatch — aborting.');
    server.close();
    process.exit(1);
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(JSON.stringify(data));

    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      '<h2>Success.</h2><p>Refresh token captured — return to your terminal. You can close this tab.</p>'
    );

    const outFile = process.env.SPOTIFY_TOKEN_OUT;
    if (outFile) {
      fs.writeFileSync(outFile, data.refresh_token, { mode: 0o600 });
      console.log(`\nRefresh token written to ${outFile} (not printed).\n`);
    } else {
      console.log('\n=== SPOTIFY_REFRESH_TOKEN ===');
      console.log(data.refresh_token);
      console.log('=============================\n');
      console.log('Store it with:\n  cd worker && wrangler secret put SPOTIFY_REFRESH_TOKEN\n');
    }

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end('Token exchange failed. Check the terminal.');
    console.error('\nToken exchange failed:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on ${REDIRECT_URI}`);
  console.log('Opening browser for Spotify consent...\n');
  console.log(`If it doesn't open, visit:\n${authUrl}\n`);
  openBrowser(authUrl);
});
