import { providerFetch } from './http';
// One short editorial "glance" sentence, synthesized by Claude Haiku.
// Deliberately tiny: we only synthesize the single sentence, not the whole dashboard.
import type { Env } from './index';

interface DashboardData {
  calendar: { time: string; title: string }[];
  emails: unknown[];
  tasks: unknown[];
  spotify: { playing: { track: string } | null };
}

export async function synthesizeGlance(data: DashboardData, env: Env): Promise<string> {
  const firstEvent = data.calendar[0];
  const facts = [
    `${data.calendar.length} events today`,
    firstEvent ? `first at ${firstEvent.time}: ${firstEvent.title}` : 'no scheduled events',
    `${data.emails.length} recent emails`,
    `${data.tasks.length} tasks due`,
    data.spotify.playing ? `now playing ${data.spotify.playing.track}` : 'nothing playing',
  ].join('; ');

  try {
    const resp = await providerFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system:
          'You write one calm, present-tense sentence summarizing the day at a glance. ' +
          'Address the reader as "you". Never write in the first person: no "I", "my", or "we". ' +
          'No em dashes. No preamble. Return only the sentence.',
        messages: [{ role: 'user', content: `Today: ${facts}.` }],
      }),
    });

    if (!resp.ok) return '';
    const data2 = (await resp.json()) as { content?: { text?: string }[] };
    return data2.content?.[0]?.text?.trim() ?? '';
  } catch {
    return '';
  }
}
