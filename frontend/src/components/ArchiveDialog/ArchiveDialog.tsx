import { useState } from 'react'
import { useI18n } from '../../i18n'
import { useArchivedTasks, useDeleteTask } from '../../hooks/useKanban'
import { fmtTime } from '../../utils/time'
import { workspaceName } from '../../utils/path'
import { Modal } from '../common/Modal'

// Archived history: browse, single delete, select-all delete. Read-only.
export function ArchiveDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const archived = useArchivedTasks(true)
  const del = useDeleteTask()
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const tasks = archived.data ?? []
  const allChecked = tasks.length > 0 && checked.size === tasks.length

  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(tasks.map((x) => x.id)))
  }
  const toggleOne = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteIds = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await del.mutateAsync(id)
      } catch (e) {
        alert(t('alert.deleteFailed', { e: e instanceof Error ? e.message : String(e) }))
        return
      }
    }
    setChecked((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  return (
    <Modal onClose={onClose} className="archive-modal">
      <h3>
        {t('archive.title')}
        <span className="archive-count">{t('archive.count', { n: tasks.length })}</span>
      </h3>
      <div className="archive-toolbar">
        <label className="archive-select-all">
          <input type="checkbox" checked={allChecked} disabled={tasks.length === 0} onChange={toggleAll} />
          <span>{t('archive.selectAll')}</span>
        </label>
        <button
          type="button"
          className="btn danger sm"
          disabled={checked.size === 0}
          onClick={() => {
            if (confirm(t('archive.deleteManyConfirm', { n: checked.size }))) void deleteIds([...checked])
          }}
        >
          {t('archive.deleteSelected')}
        </button>
      </div>
      <div className="archive-list">
        {tasks.length === 0 && <p className="history-empty">{t('archive.empty')}</p>}
        {tasks.map((task) => (
          <div key={task.id} className="history-row">
            <input
              type="checkbox"
              className="history-check"
              title={t('archive.checkTitle')}
              checked={checked.has(task.id)}
              onChange={() => toggleOne(task.id)}
            />
            <div className="history-main">
              <div className="history-title">{task.title}</div>
              <div className="history-path" title={task.workspacePath}>
                {workspaceName(task.workspacePath)} — {task.workspacePath}
              </div>
              {task.tags.length > 0 && (
                <div className="history-tags">
                  {task.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="history-side">
              <div className="history-when">
                {t('archive.completedAt')} {fmtTime(task.completedAt, lang)}
              </div>
              <button
                type="button"
                className="btn danger sm"
                onClick={() => {
                  if (confirm(t('archive.deleteOneConfirm'))) void deleteIds([task.id])
                }}
              >
                {t('archive.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('archive.close')}
        </button>
      </div>
    </Modal>
  )
}
