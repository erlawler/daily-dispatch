import {it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

  it('allows the exact inline script hash plus required weather and font sources', () => {
    const html = readFileSync(new URL('../../frontend/index.html', import.meta.url), 'utf8');
    const policy = readFileSync(new URL('../../frontend/_headers', import.meta.url), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    for (const [, script] of scripts) expect(policy).toContain(`'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    expect(policy).toContain("connect-src 'self' https://api.open-meteo.com");
    expect(policy).toContain('https://fonts.googleapis.com'); expect(policy).toContain('https://fonts.gstatic.com');
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline|unsafe-eval/);
  });
