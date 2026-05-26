#!/usr/bin/env node
// One-time Google OAuth dance to obtain a long-lived refresh token.
//
// Usage:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-refresh-token.mjs
// or just `node scripts/get-google-refresh-token.mjs` and paste the values when prompted.
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
const REDIRECT_URI = `http://localhost:${PORT}/oauth/google/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
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

const clientId = process.env.GOOGLE_CLIENT_ID || (await prompt('Google Client ID: '));
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || (await prompt('Google Client Secret: '));

if (!clientId || !clientSecret) {
  console.error('Both Client ID and Client Secret are required.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-auth
    state,
  }).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth/google/callback') {
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
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(JSON.stringify(data));

    if (!data.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        '<h2>No refresh token returned.</h2><p>Revoke the app at ' +
        'https://myaccount.google.com/permissions and run this script again.</p>'
      );
      console.error(
        '\nNo refresh_token in response. Revoke prior access at ' +
        'https://myaccount.google.com/permissions then re-run.'
      );
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      '<h2>Success.</h2><p>Refresh token captured — return to your terminal. You can close this tab.</p>'
    );

    const outFile = process.env.GOOGLE_TOKEN_OUT;
    if (outFile) {
      fs.writeFileSync(outFile, data.refresh_token, { mode: 0o600 });
      console.log(`\nRefresh token written to ${outFile} (not printed).\n`);
    } else {
      console.log('\n=== GOOGLE_REFRESH_TOKEN ===');
      console.log(data.refresh_token);
      console.log('============================\n');
      console.log('Store it with:\n  cd worker && wrangler secret put GOOGLE_REFRESH_TOKEN\n');
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
  console.log('Opening browser for Google consent...\n');
  console.log(`If it doesn't open, visit:\n${authUrl}\n`);
  openBrowser(authUrl);
});
