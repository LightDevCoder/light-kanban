import type { Agent, Status, Task } from '../../types'
import { BOARD_COLUMNS } from '../../types'
import { useI18n } from '../../i18n'
import {
  activeFilterCount,
  EMPTY_FILTERS,
  tagOptions,
  workspaceOptions,
  type Filters,
} from '../../features/filters/filters'
import { usePopover } from '../../hooks/usePopover'
import { Avatar } from '../common/Avatar'
import { FilterIcon } from '../common/icons'
import { workspaceColor } from '../../utils/color'

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

// Composable filter popover: Agent / Workspace / Tag / Status. Applies to
// the board live; never navigates away.
export function FilterPopover({
  tasks,
  agents,
  filters,
  onChange,
}: {
  tasks: Task[]
  agents: Agent[]
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  const count = activeFilterCount(filters)
  const wsOptions = workspaceOptions(tasks)
  const tags = tagOptions(tasks)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={count ? 'top-btn has-filters' : 'top-btn'}
        onClick={() => setOpen(!open)}
        title={t('filter.title')}
      >
        <FilterIcon />
        {t('topbar.filter')}
        {count > 0 && <span className="filter-badge">{count}</span>}
      </button>
      {open && (
        <div className="popover filter-pop" style={{ right: 0 }}>
          <div className="filter-head">
            <span className="title">{t('filter.title')}</span>
            {count > 0 && (
              <button className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)}>
                {t('filter.clear')}
              </button>
            )}
          </div>

          <div className="filter-section">
            <div className="label">{t('filter.agent')}</div>
            {agents.length === 0 && <div className="filter-none">{t('filter.none')}</div>}
            {agents.map((a) => (
              <label key={a.id} className="check-row">
                <input
                  type="checkbox"
                  checked={filters.agents.includes(a.id)}
                  onChange={() => onChange({ ...filters, agents: toggle(filters.agents, a.id) })}
                />
                <Avatar agent={a} />
                <span>{a.name || a.id}</span>
              </label>
            ))}
          </div>

          <div className="filter-section">
            <div className="label">{t('filter.workspace')}</div>
            {wsOptions.length === 0 && <div className="filter-none">{t('filter.none')}</div>}
            {wsOptions.map((ws) => (
              <label key={ws.path} className="check-row" title={ws.path}>
                <input
                  type="checkbox"
                  checked={filters.workspaces.includes(ws.path)}
                  onChange={() => onChange({ ...filters, workspaces: toggle(filters.workspaces, ws.path) })}
                />
                <i className="ws-dot" style={{ background: workspaceColor(ws.path) }} />
                <span>{ws.name}</span>
              </label>
            ))}
          </div>

          <div className="filter-section">
            <div className="label">{t('filter.tag')}</div>
            {tags.length === 0 && <div className="filter-none">{t('filter.none')}</div>}
            {tags.map((tag) => (
              <label key={tag} className="check-row">
                <input
                  type="checkbox"
                  checked={filters.tags.includes(tag)}
                  onChange={() => onChange({ ...filters, tags: toggle(filters.tags, tag) })}
                />
                <span>{tag}</span>
              </label>
            ))}
          </div>

          <div className="filter-section">
            <div className="label">{t('filter.status')}</div>
            {BOARD_COLUMNS.map((s: Status) => (
              <label key={s} className="check-row">
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(s)}
                  onChange={() => onChange({ ...filters, statuses: toggle(filters.statuses, s) as Status[] })}
                />
                <span className={`dot dot-${s}`} />
                <span>{t(`status.${s}`)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
