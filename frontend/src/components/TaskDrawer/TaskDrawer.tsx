import { useEffect, useState } from 'react'
import type { Agent, Task } from '../../types'
import { useI18n } from '../../i18n'
import { shortId } from '../../utils/id'
import { workspaceName } from '../../utils/path'
import { dueState, fmtTime, isStuck } from '../../utils/time'
import { openFolder } from '../../api/filesystem'
import {
  useDeleteTask,
  usePatchTask,
  useRejectTask,
  useTaskAction,
} from '../../hooks/useKanban'
import { Avatar } from '../common/Avatar'
import { CloseIcon, FolderIcon } from '../common/icons'
import { TaskForm, type TaskFormValues } from '../TaskForm/TaskForm'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Right-side drawer. View mode by default; editing is an explicit switch.
// The board stays visible and keeps its scroll position behind it.
export function TaskDrawer({
  task,
  agent,
  startReject,
  onClose,
}: {
  task: Task
  agent: Agent | null
  startReject?: boolean
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [rejectOpen, setRejectOpen] = useState(Boolean(startReject))
  const [feedback, setFeedback] = useState('')

  const patch = usePatchTask()
  const del = useDeleteTask()
  const action = useTaskAction()
  const reject = useRejectTask()

  // Reset local UI state when a different card is opened.
  useEffect(() => {
    setMode('view')
    setRejectOpen(Boolean(startReject))
    setFeedback('')
  }, [task.id, startReject])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const opFailed = (e: unknown) => alert(t('alert.opFailed', { e: errMsg(e) }))

  const save = (v: TaskFormValues) => {
    const input: Parameters<typeof patch.mutate>[0]['input'] = {
      title: v.title,
      workspacePath: v.workspacePath,
      description: v.description,
      tags: v.tags,
      dueAt: v.dueAt,
    }
    if (v.status !== task.status) input.status = v.status
    patch.mutate(
      { id: task.id, input },
      {
        onSuccess: () => setMode('view'),
        onError: (e) => alert(t('alert.saveFailed', { e: errMsg(e) })),
      },
    )
  }

  const remove = () => {
    if (!confirm(t('alert.deleteTaskConfirm'))) return
    del.mutate(task.id, { onSuccess: onClose, onError: opFailed })
  }

  const submitReject = () => {
    reject.mutate(
      { id: task.id, feedback: feedback.trim() || undefined },
      {
        onSuccess: () => {
          setRejectOpen(false)
          setFeedback('')
        },
        onError: opFailed,
      },
    )
  }

  const due = dueState(task.dueAt)
  const stuck = isStuck(task)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" data-tour="task-drawer">
        <div className="drawer-head">
          <span className="drawer-id">{shortId(task.id)}</span>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" title={t('drawer.close')} onClick={onClose} data-tour="drawer-close">
            <CloseIcon />
          </button>
        </div>

        {mode === 'edit' ? (
          <div className="drawer-body">
            <h2 className="drawer-title">{t('edit.title')}</h2>
            <TaskForm initial={task} isEdit onSubmit={save} onCancel={() => setMode('view')} submitting={patch.isPending} />
          </div>
        ) : (
          <>
            <div className="drawer-body">
              <h2 className="drawer-title">{task.title}</h2>

              <div className="field" data-tour="task-status">
                <div className="field-label">{t('drawer.status')}</div>
                <div className="field-value">
                  <span className="status-pill">
                    <span className={`dot dot-${task.status}`} />
                    {t(`status.${task.status}`)}
                  </span>
                  {stuck && (
                    <span className="meta-stuck" style={{ marginLeft: 8 }}>
                      ⚠ {t('card.stuck')}
                    </span>
                  )}
                </div>
              </div>

              <div className="field">
                <div className="field-label">{t('drawer.agent')}</div>
                <div className="field-value">
                  {agent ? (
                    <span className="field-row">
                      <Avatar agent={agent} large />
                      <span className="agent-name">{agent.name || agent.id}</span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>{t('drawer.unclaimed')}</span>
                  )}
                </div>
              </div>

              <div className="field">
                <div className="field-label">{t('drawer.workspace')}</div>
                <div className="field-value">
                  <div className="field-row">
                    <span style={{ fontWeight: 500 }}>{workspaceName(task.workspacePath)}</span>
                    <button
                      className="icon-btn"
                      title={t('card.openFolder')}
                      data-tour="open-folder"
                      onClick={() => openFolder(task.workspacePath).catch(opFailed)}
                    >
                      <FolderIcon />
                    </button>
                  </div>
                  <div className="field-value mono" style={{ marginTop: 2 }}>
                    {task.workspacePath}
                  </div>
                </div>
              </div>

              {task.status === 'blocked' && task.blockReason && (
                <div className="field">
                  <div className="field-label">{t('drawer.blockReason')}</div>
                  <div className="notice danger">{task.blockReason}</div>
                </div>
              )}

              {task.reviewFeedback && (
                <div className="field">
                  <div className="field-label">{t('drawer.reviewFeedback')}</div>
                  <div className="notice warn">{task.reviewFeedback}</div>
                </div>
              )}

              {task.description && (
                <div className="field">
                  <div className="field-label">{t('drawer.description')}</div>
                  <div className="field-value">{task.description}</div>
                </div>
              )}

              {task.tags.length > 0 && (
                <div className="field">
                  <div className="field-label">{t('drawer.tags')}</div>
                  <div className="field-value card-meta">
                    {task.tags.map((tag) => (
                      <span key={tag} className="meta-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {task.dueAt && (
                <div className="field">
                  <div className="field-label">{t('drawer.due')}</div>
                  <div className="field-value">
                    <span className={due === 'overdue' ? 'meta-due overdue' : due === 'today' ? 'meta-due today' : ''}>
                      {fmtTime(task.dueAt, lang)}
                    </span>
                    {due === 'overdue' && <span className="meta-due overdue"> · {t('card.overdue')}</span>}
                    {due === 'today' && <span className="meta-due today"> · {t('card.dueToday')}</span>}
                  </div>
                </div>
              )}

              <div className="field">
                <div className="field-value" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>
                  {t('drawer.created')} {fmtTime(task.createdAt, lang)} · {t('drawer.updated')}{' '}
                  {fmtTime(task.updatedAt, lang)}
                  {task.completedAt && (
                    <>
                      {' '}
                      · {t('drawer.completed')} {fmtTime(task.completedAt, lang)}
                    </>
                  )}
                </div>
              </div>
            </div>

            {rejectOpen && (
              <div className="feedback-panel">
                <label className="form-field">
                  <span>{t('drawer.feedbackLabel')}</span>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={t('drawer.feedbackPlaceholder')}
                    autoFocus
                  />
                </label>
                <div className="row">
                  <button className="btn primary sm" onClick={submitReject} disabled={reject.isPending}>
                    {t('drawer.feedbackSubmit')}
                  </button>
                  <button className="btn sm" onClick={() => setRejectOpen(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            <div className="drawer-actions">
              {task.status === 'awaiting_confirmation' && (
                <>
                  <button
                    className="btn primary"
                    title={t('drawer.acceptTitle')}
                    onClick={() => action.mutate({ id: task.id, action: 'archive' }, { onError: opFailed })}
                  >
                    {t('drawer.accept')}
                  </button>
                  {!rejectOpen && (
                    <button className="btn" onClick={() => setRejectOpen(true)}>
                      {t('drawer.requestChanges')}
                    </button>
                  )}
                </>
              )}
              {task.status === 'in_progress' && (
                <button
                  className="btn"
                  title={t('drawer.recycleTitle')}
                  onClick={() => action.mutate({ id: task.id, action: 'recycle' }, { onError: opFailed })}
                >
                  {t('drawer.recycle')}
                </button>
              )}
              <button className="btn" onClick={() => setMode('edit')}>
                {t('drawer.edit')}
              </button>
              <button className="btn danger" onClick={remove}>
                {t('drawer.delete')}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
