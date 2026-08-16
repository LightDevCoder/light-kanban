// API contract types — mirror internal/store/store.go JSON tags.

export type Status = 'todo' | 'in_progress' | 'blocked' | 'awaiting_confirmation' | 'archived'

export interface Task {
  id: string
  title: string
  workspacePath: string
  description: string | null
  status: Status
  claimedBy: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  dueAt: string | null
  blockReason: string | null
  reviewFeedback: string | null
}

export interface Agent {
  id: string
  name: string
  avatar: string | null
}

export interface TaskCreateInput {
  title: string
  workspacePath: string
  description?: string
  tags?: string[]
  dueAt?: string
}

export interface TaskPatchInput {
  title?: string
  workspacePath?: string
  description?: string
  tags?: string[]
  dueAt?: string
  status?: Status
}

/** Visible board columns, in order. `archived` is a hidden terminal state. */
export type ColumnStatus = 'todo' | 'in_progress' | 'blocked' | 'awaiting_confirmation'
export const BOARD_COLUMNS: ColumnStatus[] = ['todo', 'in_progress', 'blocked', 'awaiting_confirmation']
