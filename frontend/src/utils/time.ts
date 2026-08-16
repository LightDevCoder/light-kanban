import type { Task } from '../types'

// A 处理中 task untouched for longer than this is flagged "suspected stuck".
export const STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function fmtTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
}

export function isStuck(task: Task, now = Date.now()): boolean {
  if (task.status !== 'in_progress') return false
  const updated = Date.parse(task.updatedAt)
  if (Number.isNaN(updated)) return false
  return now - updated > STUCK_THRESHOLD_MS
}

export type DueState = 'overdue' | 'today' | 'future' | null

export function dueState(dueAt: string | null | undefined, now = Date.now()): DueState {
  if (!dueAt) return null
  const due = Date.parse(dueAt)
  if (Number.isNaN(due)) return null
  if (due < now) return 'overdue'
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return due <= endOfToday.getTime() ? 'today' : 'future'
}

/** Short due label for card metadata: "1/20" style date for future dates. */
export function fmtDueShort(iso: string, lang: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' })
}
