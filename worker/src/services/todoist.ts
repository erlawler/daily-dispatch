import { providerFetch } from '../http';
// Today + overdue Todoist tasks, with project names resolved.
import type { Env } from '../index';

export interface TaskItem {
  title: string;
  sub: string;
}
export interface TodoistResult {
  ok: boolean;
  items: TaskItem[];
}

function rows(json: any): any[] {
  // The v1 API wraps results in { results: [...] }; older shapes return a bare array.
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

export async function fetchTodoist(env: Env): Promise<TodoistResult> {
  try {
    const headers = { Authorization: `Bearer ${env.TODOIST_TOKEN}` };

    const [tasksRes, projectsRes] = await Promise.all([
      providerFetch(
        'https://api.todoist.com/api/v1/tasks/filter?query=' +
          encodeURIComponent('(today | overdue)'),
        { headers }
      ),
      providerFetch('https://api.todoist.com/api/v1/projects', { headers }),
    ]);

    if (!tasksRes.ok) return { ok: false, items: [] };

    const tasks = rows(await tasksRes.json());
    const projects = projectsRes.ok ? rows(await projectsRes.json()) : [];
    const projectName = new Map<string, string>(
      projects.map((p: any) => [String(p.id), p.name as string])
    );

    return {
      ok: true,
      items: tasks.map((t: any) => {
        const project = projectName.get(String(t.project_id)) ?? 'Inbox';
        const due = t.due?.string || t.due?.date || '';
        return {
          title: t.content ?? '(untitled task)',
          sub: [project, due].filter(Boolean).join(' · '),
        };
      }),
    };
  } catch {
    return { ok: false, items: [] };
  }
}
