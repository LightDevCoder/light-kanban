import type { Agent, Task } from '../../types'
import type { Filters } from '../../features/filters/filters'
import { useI18n } from '../../i18n'
import { FilterPopover } from '../FilterPopover/FilterPopover'
import { SettingsMenu } from '../Settings/SettingsMenu'
import { SearchIcon } from '../common/icons'

// Quiet, flat topbar: brand on the left; search / filter / settings /
// create on the right. The connection dot only speaks up when broken.
export function Topbar({
  tasks,
  agents,
  search,
  onSearch,
  filters,
  onFilters,
  connected,
  onCreate,
  onOpenGuide,
  onOpenArchive,
}: {
  tasks: Task[]
  agents: Agent[]
  search: string
  onSearch: (s: string) => void
  filters: Filters
  onFilters: (f: Filters) => void
  connected: boolean
  onCreate: () => void
  onOpenGuide: () => void
  onOpenArchive: () => void
}) {
  const { t } = useI18n()

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">Light Kanban</span>
        <span className="brand-board">{t('topbar.board')}</span>
      </div>
      <div className="topbar-right">
        {!connected && <span className="conn-bad">{t('conn.bad')}</span>}
        <div className="search-box">
          <SearchIcon />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('topbar.search')} />
        </div>
        <FilterPopover tasks={tasks} agents={agents} filters={filters} onChange={onFilters} />
        <SettingsMenu onOpenGuide={onOpenGuide} onOpenArchive={onOpenArchive} />
        <button className="create-btn" title={t('topbar.create')} onClick={onCreate}>
          +
        </button>
      </div>
    </header>
  )
}
