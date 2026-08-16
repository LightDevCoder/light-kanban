import { useState } from 'react'
import type { Task } from './types'
import { EMPTY_FILTERS, type Filters } from './features/filters/filters'
import { useAgents, useTasks } from './hooks/useKanban'
import { Topbar } from './components/Topbar/Topbar'
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard'
import { TaskDrawer } from './components/TaskDrawer/TaskDrawer'
import { CreateTaskDialog } from './components/CreateTaskDialog/CreateTaskDialog'
import { ArchiveDialog } from './components/ArchiveDialog/ArchiveDialog'
import { ProductTour } from './components/ProductTour/ProductTour'
import { isTourCompleted } from './components/ProductTour/logic'

export default function App() {
  const tasksQ = useTasks()
  const agentsQ = useAgents()
  const connected = !tasksQ.isError && !agentsQ.isError

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejectOnOpen, setRejectOnOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(() => !isTourCompleted())
  // Task id captured from the create mutation result, so the running tour
  // can track the exact card instead of guessing from the DOM.
  const [tourCreatedId, setTourCreatedId] = useState<string | null>(null)

  const tasks = tasksQ.data ?? []
  const agents = agentsQ.data ?? []
  const selectedTask = tasks.find((x) => x.id === selectedId) ?? null
  const selectedAgent =
    selectedTask?.claimedBy != null
      ? agents.find((a) => a.id === selectedTask.claimedBy) ?? {
          id: selectedTask.claimedBy,
          name: selectedTask.claimedBy,
          avatar: null,
        }
      : null

  const openTask = (task: Task, opts?: { reject?: boolean }) => {
    setSelectedId(task.id)
    setRejectOnOpen(Boolean(opts?.reject))
  }

  return (
    <div className="app">
      <Topbar
        tasks={tasks}
        agents={agents}
        search={search}
        onSearch={setSearch}
        filters={filters}
        onFilters={setFilters}
        connected={connected}
        onCreate={() => setCreateOpen(true)}
        onOpenGuide={() => {
          // Manual replay always starts fresh — a stale id from an earlier
          // run must never satisfy the new run's created-task step.
          setTourCreatedId(null)
          setGuideOpen(true)
        }}
        onOpenArchive={() => setArchiveOpen(true)}
      />
      <KanbanBoard
        tasks={tasks}
        agents={agents}
        search={search}
        filters={filters}
        onOpenTask={openTask}
        onQuickAdd={() => setCreateOpen(true)}
      />
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          agent={selectedAgent}
          startReject={rejectOnOpen}
          onClose={() => setSelectedId(null)}
        />
      )}
      {createOpen && (
        <CreateTaskDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(task) => setTourCreatedId(task.id)}
        />
      )}
      {archiveOpen && <ArchiveDialog onClose={() => setArchiveOpen(false)} />}
      {guideOpen && (
        <ProductTour createdTaskId={tourCreatedId} onExit={() => setGuideOpen(false)} />
      )}
    </div>
  )
}
