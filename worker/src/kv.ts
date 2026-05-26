// Phase 3: KV helpers. Scaffold stub.
import type { Env } from './index';

export async function kvGetJSON<T>(env: Env, key: string): Promise<T | null> {
  return env.TOKENS.get<T>(key, 'json');
}

export async function kvPutJSON(
  env: Env,
  key: string,
  value: unknown,
  expirationTtl?: number
): Promise<void> {
  await env.TOKENS.put(
    key,
    JSON.stringify(value),
    expirationTtl ? { expirationTtl } : undefined
  );
}
