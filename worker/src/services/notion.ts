import { providerFetch } from '../http';
// Recently edited Notion pages via /v1/search.
import type { Env } from '../index';
import { shortDate } from '../time';

export interface NotionItem {
  title: string;
  sub: string;
  url: string;
}
export interface NotionResult {
  ok: boolean;
  items: NotionItem[];
}

function extractTitle(obj: any): string {
  // Database objects carry a top-level title array.
  if (Array.isArray(obj.title) && obj.title.length) {
    return obj.title.map((t: any) => t.plain_text).join('').trim() || 'Untitled';
  }
  // Page objects: find the property of type "title".
  const props = obj.properties ?? {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === 'title' && Array.isArray(p.title)) {
      const text = p.title.map((t: any) => t.plain_text).join('').trim();
      if (text) return text;
    }
  }
  return 'Untitled';
}

export async function fetchNotion(env: Env): Promise<NotionResult> {
  try {
    const resp = await providerFetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 5,
      }),
    });
    if (!resp.ok) return { ok: false, items: [] };
    const data = (await resp.json()) as { results?: any[] };
    return {
      ok: true,
      items: (data.results ?? []).map((r) => ({
        title: extractTitle(r),
        sub: r.last_edited_time ? `Edited ${shortDate(r.last_edited_time, env.TIMEZONE)}` : '',
        url: r.url ?? '',
      })),
    };
  } catch {
    return { ok: false, items: [] };
  }
}
