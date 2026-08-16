import { useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { BOARD_COLUMNS, type Status, type Task } from '../../types'
import { pickFolder } from '../../api/filesystem'

export interface TaskFormValues {
  title: string
  workspacePath: string
  description: string
  tags: string[]
  dueAt: string // '' = none; otherwise RFC3339
  status: Status
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Shared create/edit form. The workspace path can be typed/pasted directly,
// or picked with the server machine's native folder dialog via「选择…」.
export function TaskForm({
  initial,
  isEdit,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Task
  isEdit: boolean
  onSubmit: (v: TaskFormValues) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [workspacePath, setWorkspacePath] = useState(initial?.workspacePath ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '))
  const [dueLocal, setDueLocal] = useState(toLocalInput(initial?.dueAt))
  const [status, setStatus] = useState<Status>(initial?.status ?? 'todo')
  const [picking, setPicking] = useState(false)
  const pickAbort = useRef<AbortController | null>(null)

  const prefix = isEdit ? 'edit' : 'add'

  // The native dialog opens on the server machine; while it is up, the HTTP
  // request stays open. The button turns into a waiting state with a cancel
  // that aborts the request (the server then stops waiting too).
  const systemPick = async () => {
    const ctl = new AbortController()
    pickAbort.current = ctl
    setPicking(true)
    try {
      const res = await pickFolder(ctl.signal)
      if (res.path) setWorkspacePath(res.path)
    } catch (err) {
      if (!ctl.signal.aborted) {
        alert(t('alert.pickFailed', { e: err instanceof Error ? err.message : String(err) }))
      }
    } finally {
      setPicking(false)
      pickAbort.current = null
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      title: title.trim(),
      workspacePath: workspacePath.trim(),
      description,
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      dueAt: dueLocal ? new Date(dueLocal).toISOString() : '',
      status,
    })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label className="form-field">
        <span>{t(`${prefix}.titleField`)}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus={!isEdit}
          placeholder={isEdit ? undefined : t('add.phTitle')}
          data-tour={isEdit ? undefined : 'task-title'}
        />
      </label>
      <label className="form-field">
        <span>{t(`${prefix}.workspaceField`)}</span>
        <span className="path-row" data-tour={isEdit ? undefined : 'workspace-path'}>
          <input
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            required
            placeholder={isEdit ? undefined : t('add.phWorkspace')}
          />
          {picking ? (
            <button type="button" className="btn sm" onClick={() => pickAbort.current?.abort()}>
              {t('pick.cancelWait')}
            </button>
          ) : (
            <button type="button" className="btn sm" title={t('pick.chooseTitle')} onClick={() => void systemPick()}>
              {t('pick.choose')}
            </button>
          )}
        </span>
        {picking && <span className="pick-waiting">{t('pick.waiting')}</span>}
      </label>
      <label className="form-field">
        <span>{t(`${prefix}.descField`)}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isEdit ? undefined : t('add.phDesc')}
        />
      </label>
      <label className="form-field">
        <span>{t(`${prefix}.tagsField`)}</span>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder={isEdit ? undefined : t('add.phTags')}
        />
      </label>
      <label className="form-field">
        <span>{t(`${prefix}.dueField`)}</span>
        <input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
      </label>
      {isEdit && (
        <label className="form-field">
          <span>{t('edit.statusField')}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {BOARD_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
            <option value="archived">{t('status.archived')}</option>
          </select>
        </label>
      )}
      <div className="modal-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={submitting}
          data-tour={isEdit ? undefined : 'create-submit'}
        >
          {t(`${prefix}.submit`)}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
