import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { browseDirs } from '../../api/filesystem'
import { isAbsolutePath, parentOf } from '../../utils/path'
import { Modal } from '../common/Modal'

// In-page server folder browser for the workspacePath field.
export function FolderBrowserDialog({
  onSelect,
  onClose,
}: {
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<string[]>([])

  const load = useCallback(
    async (p: string) => {
      try {
        // Never send a non-absolute path: reset to roots instead of a 400.
        const res = await browseDirs(p && isAbsolutePath(p) ? p : '')
        setPath(res.path)
        setDirs(res.dirs)
      } catch (err) {
        alert(t('alert.browseFailed', { e: err instanceof Error ? err.message : String(err) }))
      }
    },
    [t],
  )

  useEffect(() => {
    void load('')
  }, [load])

  return (
    <Modal onClose={onClose} className="browse-modal">
      <h3>{t('browse.title')}</h3>
      <div className="browse-path" title={path}>
        {path || t('browse.root')}
      </div>
      <div className="browse-listing">
        {dirs.length === 0 && <p className="history-empty">{t('browse.empty')}</p>}
        {dirs.map((dir) => (
          <button key={dir} type="button" className="browse-item" title={dir} onClick={() => void load(dir)}>
            {dir}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => void load(parentOf(path))}>
          {t('browse.up')}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (path) onSelect(path)
            onClose()
          }}
        >
          {t('browse.select')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
