import { useI18n } from '../../i18n'
import { useCreateTask } from '../../hooks/useKanban'
import { Modal } from '../common/Modal'
import { TaskForm, type TaskFormValues } from '../TaskForm/TaskForm'

// Compact create dialog; new tasks always land in 待处理.
export function CreateTaskDialog({ onClose }: { onClose: () => void }) {
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
        onSuccess: onClose,
        onError: (e) => alert(t('alert.addFailed', { e: e.message })),
      },
    )
  }

  return (
    <Modal onClose={onClose}>
      <h3>{t('add.title')}</h3>
      <TaskForm isEdit={false} onSubmit={submit} onCancel={onClose} submitting={create.isPending} />
    </Modal>
  )
}
