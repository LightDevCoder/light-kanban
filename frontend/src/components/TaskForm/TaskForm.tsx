import { useState } from 'react'
import { useI18n } from '../../i18n'
import { BOARD_COLUMNS, type Status, type Task } from '../../types'
import { FolderBrowserDialog } from '../FolderBrowser/FolderBrowserDialog'

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

// Shared create/edit form. The workspace field has a single「浏览…」entry —
// the in-page server folder browser (no native system picker).
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
  const [browseOpen, setBrowseOpen] = useState(false)

  const prefix = isEdit ? 'edit' : 'add'

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
        />
      </label>
      <label className="form-field">
        <span>{t(`${prefix}.workspaceField`)}</span>
        <span className="path-row">
          <input
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            required
            placeholder={isEdit ? undefined : t('add.phWorkspace')}
          />
          <button type="button" className="btn sm" title={t('browse.browseTitle')} onClick={() => setBrowseOpen(true)}>
            {t('browse.browse')}
          </button>
        </span>
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
        <button type="submit" className="btn primary" disabled={submitting}>
          {t(`${prefix}.submit`)}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      {browseOpen && (
        <FolderBrowserDialog
          onSelect={(p) => {
            setWorkspacePath(p)
            setBrowseOpen(false)
          }}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </form>
  )
}
