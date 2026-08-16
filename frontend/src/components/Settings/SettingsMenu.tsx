import { useI18n } from '../../i18n'
import { usePopover } from '../../hooks/usePopover'
import { SettingsIcon } from '../common/icons'

// Low-frequency entries live here instead of crowding the topbar:
// language, guide, archive.
export function SettingsMenu({
  onOpenGuide,
  onOpenArchive,
}: {
  onOpenGuide: () => void
  onOpenArchive: () => void
}) {
  const { t, lang, setLang } = useI18n()
  const { open, setOpen, ref } = usePopover()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="top-btn" onClick={() => setOpen(!open)} title={t('topbar.settings')}>
        <SettingsIcon />
      </button>
      {open && (
        <div className="popover" style={{ right: 0 }}>
          <button className="menu-item" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            <span>{t('settings.language')}</span>
            <span className="sub">{lang === 'zh' ? '中文' : 'English'}</span>
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onOpenGuide()
            }}
          >
            <span>{t('settings.guide')}</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onOpenArchive()
            }}
          >
            <span>{t('settings.archive')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
