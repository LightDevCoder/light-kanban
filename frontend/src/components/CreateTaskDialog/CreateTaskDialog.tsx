import { useI18n } from '../../i18n'
import { useCreateTask } from '../../hooks/useKanban'
import type { Task } from '../../types'
import { Modal } from '../common/Modal'
import { TaskForm, type TaskFormValues } from '../TaskForm/TaskForm'

// Compact create dialog; new tasks always land in 待处理.
export function CreateTaskDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Called with the mutation result (the created task) — the tour tracks its id from here. */
  onCreated?: (task: Task) => void
}) {
  const { t } = useI18n()
  const create = useCreateTask()

  const submit = (v: TaskFormValues) => {
    create.mutate(
      {
        title: v.title,
        workspacePath: v.workspacePath,
        ...(v.description.trim() ? { description: v.description } : {}),
        ...(v.tags.length ? { tags: v.tags } : {}),
        ...(v.dueAt ? { dueAt: v.dueAt } : {}),
      },
      {
        onSuccess: (task) => {
          onCreated?.(task)
          onClose()
        },
        onError: (e) => alert(t('alert.addFailed', { e: e.message })),
      },
    )
  }

  return (
    <Modal onClose={onClose} dataTour="create-dialog">
      <h3>{t('add.title')}</h3>
      <TaskForm isEdit={false} onSubmit={submit} onCancel={onClose} submitting={create.isPending} />
    </Modal>
  )
}
