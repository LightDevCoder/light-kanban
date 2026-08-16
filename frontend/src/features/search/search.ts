import type { Agent, Task } from '../../types'
import { workspaceName } from '../../utils/path'

// Board-wide search: title, description, workspace (full path + basename),
// tags, and the claiming agent's display name.
export function matchesSearch(task: Task, agent: Agent | null, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystacks = [
    task.title,
    task.description ?? '',
    task.workspacePath,
    workspaceName(task.workspacePath),
    ...task.tags,
    agent?.name ?? '',
  ]
  return haystacks.some((h) => h.toLowerCase().includes(q))
}
