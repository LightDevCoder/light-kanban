import type { Agent, Status, Task } from '../../types'
import { workspaceName } from '../../utils/path'

// Composable board filters. Workspace options key on the full path (unique)
// but display as basenames.
export interface Filters {
  agents: string[]
  workspaces: string[]
  tags: string[]
  statuses: Status[]
}

export const EMPTY_FILTERS: Filters = { agents: [], workspaces: [], tags: [], statuses: [] }

export function activeFilterCount(f: Filters): number {
  return f.agents.length + f.workspaces.length + f.tags.length + f.statuses.length
}

export function applyFilters(task: Task, agent: Agent | null, f: Filters): boolean {
  if (f.statuses.length && !f.statuses.includes(task.status)) return false
  if (f.agents.length && (!task.claimedBy || !f.agents.includes(task.claimedBy))) return false
  if (f.workspaces.length && !f.workspaces.includes(task.workspacePath)) return false
  if (f.tags.length && !f.tags.some((tag) => task.tags.includes(tag))) return false
  void agent
  return true
}

export interface WorkspaceOption {
  path: string
  name: string
}

export function workspaceOptions(tasks: Task[]): WorkspaceOption[] {
  const seen = new Map<string, string>()
  for (const task of tasks) {
    if (!seen.has(task.workspacePath)) seen.set(task.workspacePath, workspaceName(task.workspacePath))
  }
  return [...seen.entries()]
    .map(([path, name]) => ({ path, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function tagOptions(tasks: Task[]): string[] {
  const set = new Set<string>()
  for (const task of tasks) for (const tag of task.tags) set.add(tag)
  return [...set].sort()
}
