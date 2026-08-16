import type { Agent, ColumnStatus, Task } from '../../types'
import { useI18n } from '../../i18n'
import { TaskCard } from '../TaskCard/TaskCard'

// One status column: sticky-ish header (kept outside the scroll area) plus
// an independently scrolling card body.
export function KanbanColumn({
  status,
  tasks,
  agentsById,
  onOpenTask,
  onQuickAdd,
}: {
  status: ColumnStatus
  tasks: Task[]
  agentsById: Map<string, Agent>
  onOpenTask: (task: Task, opts?: { reject?: boolean }) => void
  onQuickAdd: () => void
}) {
  const { t } = useI18n()

  return (
    <section className="column">
      <header className="column-header">
        <span className={`dot dot-${status}`} />
        <span className="column-title">{t(`col.${status}`)}</span>
        <span className="column-count">{tasks.length}</span>
        <span className="spacer" />
        {status === 'todo' && (
          <button className="col-add" title={t('col.quickAdd')} onClick={onQuickAdd}>
            +
          </button>
        )}
      </header>
      <div className="column-body">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            agent={
              task.claimedBy
                ? agentsById.get(task.claimedBy) ?? {
                    id: task.claimedBy,
                    name: task.claimedBy,
                    avatar: null,
                  }
                : null
            }
            onOpen={(opts) => onOpenTask(task, opts)}
          />
        ))}
        {tasks.length === 0 && <div className="column-empty">{t('col.empty')}</div>}
      </div>
    </section>
  )
}
