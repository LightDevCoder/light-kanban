import { useMemo } from 'react'
import type { Agent, Task } from '../../types'
import { BOARD_COLUMNS } from '../../types'
import type { Filters } from '../../features/filters/filters'
import { applyFilters } from '../../features/filters/filters'
import { matchesSearch } from '../../features/search/search'
import { KanbanColumn } from '../KanbanColumn/KanbanColumn'

// Full-width board: four fixed state columns, horizontal scroll on narrow
// windows, no page-level vertical growth.
export function KanbanBoard({
  tasks,
  agents,
  search,
  filters,
  onOpenTask,
  onQuickAdd,
}: {
  tasks: Task[]
  agents: Agent[]
  search: string
  filters: Filters
  onOpenTask: (task: Task, opts?: { reject?: boolean }) => void
  onQuickAdd: () => void
}) {
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        const agent = task.claimedBy ? agentsById.get(task.claimedBy) ?? null : null
        return matchesSearch(task, agent, search) && applyFilters(task, agent, filters)
      }),
    [tasks, agentsById, search, filters],
  )

  return (
    <main className="board">
      {BOARD_COLUMNS.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={visible.filter((task) => task.status === status)}
          agentsById={agentsById}
          onOpenTask={onOpenTask}
          onQuickAdd={onQuickAdd}
        />
      ))}
    </main>
  )
}
