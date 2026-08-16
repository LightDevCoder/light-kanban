import { api, postJSON } from './client'
import type { Task, TaskCreateInput, TaskPatchInput } from '../types'

export function listTasks(status?: 'archived'): Promise<Task[]> {
  return api<Task[]>(status === 'archived' ? '/api/tasks?status=archived' : '/api/tasks')
}

export function createTask(input: TaskCreateInput): Promise<Task> {
  return api<Task>('/api/tasks', postJSON(input))
}

export function patchTask(id: string, input: TaskPatchInput): Promise<Task> {
  return api<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteTask(id: string): Promise<void> {
  return api<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

type EmptyAction = 'unblock' | 'complete' | 'archive' | 'recycle'

export function taskAction(id: string, action: EmptyAction): Promise<Task> {
  return api<Task>(`/api/tasks/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
}

export function blockTask(id: string, reason?: string): Promise<Task> {
  return api<Task>(`/api/tasks/${encodeURIComponent(id)}/block`, postJSON(reason ? { reason } : undefined))
}

export function rejectTask(id: string, feedback?: string): Promise<Task> {
  return api<Task>(`/api/tasks/${encodeURIComponent(id)}/reject`, postJSON(feedback ? { feedback } : undefined))
}
