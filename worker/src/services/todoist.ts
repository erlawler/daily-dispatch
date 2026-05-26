// Today + overdue Todoist tasks, with project names resolved.
import type { Env } from '../index';

export interface TaskItem {
  title: string;
  sub: string;
}

function rows(json: any): any[] {
  // The v1 API wraps results in { results: [...] }; older shapes return a bare array.
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

export async function fetchTodoist(env: Env): Promise<TaskItem[]> {
  try {
    const headers = { Authorization: `Bearer ${env.TODOIST_TOKEN}` };

    const [tasksRes, projectsRes] = await Promise.all([
      fetch(
        'https://api.todoist.com/api/v1/tasks/filter?query=' +
          encodeURIComponent('(today | overdue)'),
        { headers }
      ),
      fetch('https://api.todoist.com/api/v1/projects', { headers }),
    ]);

    if (!tasksRes.ok) return [];

    const tasks = rows(await tasksRes.json());
    const projects = projectsRes.ok ? rows(await projectsRes.json()) : [];
    const projectName = new Map<string, string>(
      projects.map((p: any) => [String(p.id), p.name as string])
    );

    return tasks.map((t: any) => {
      const project = projectName.get(String(t.project_id)) ?? 'Inbox';
      const due = t.due?.string || t.due?.date || '';
      return {
        title: t.content ?? '(untitled task)',
        sub: [project, due].filter(Boolean).join(' · '),
      };
    });
  } catch {
    return [];
  }
}
