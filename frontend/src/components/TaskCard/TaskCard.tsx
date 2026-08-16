import type { Agent, Task } from '../../types'
import { useI18n } from '../../i18n'
import { shortId } from '../../utils/id'
import { workspaceName } from '../../utils/path'
import { workspaceColor } from '../../utils/color'
import { dueState, fmtDueShort, isStuck, STUCK_THRESHOLD_MS } from '../../utils/time'
import { Avatar } from '../common/Avatar'
import { useTaskAction } from '../../hooks/useKanban'

// The card is for scanning, not reading: id + avatar / title / one metadata
// line. Everything else lives in the drawer.
export function TaskCard({
  task,
  agent,
  onOpen,
}: {
  task: Task
  agent: Agent | null
  onOpen: (opts?: { reject?: boolean }) => void
}) {
  const { t, lang } = useI18n()
  const action = useTaskAction()

  const stuck = isStuck(task)
  const due = dueState(task.dueAt)
  const shownTags = task.tags.slice(0, 2)
  const moreTags = task.tags.length - shownTags.length
  const stuckHours = Math.round(STUCK_THRESHOLD_MS / 3600000)

  return (
    <article className="card" onClick={() => onOpen()}>
      <div className="card-row1">
        <span className="card-id">{shortId(task.id)}</span>
        {agent && <Avatar agent={agent} />}
      </div>
      <h3 className="card-title">{task.title}</h3>
      {task.status === 'blocked' && task.blockReason && (
        <div className="card-blockreason">
          <span className="bang">!</span>
          <span>{task.blockReason}</span>
        </div>
      )}
      <div className="card-meta">
        <span className="meta-ws" title={task.workspacePath}>
          <i className="ws-dot" style={{ background: workspaceColor(task.workspacePath) }} />
          <span className="ws-name">{workspaceName(task.workspacePath)}</span>
        </span>
        {shownTags.map((tag) => (
          <span key={tag} className="meta-tag">
            {tag}
          </span>
        ))}
        {moreTags > 0 && <span className="meta-more">+{moreTags}</span>}
        {stuck && (
          <span className="meta-stuck" title={t('card.stuckTitle', { h: stuckHours })}>
            ⚠ {t('card.stuck')}
          </span>
        )}
        {due === 'overdue' && <span className="meta-due overdue">{t('card.overdue')}</span>}
        {due === 'today' && <span className="meta-due today">{t('card.dueToday')}</span>}
        {due === 'future' && task.dueAt && (
          <span className="meta-due">
            {t('card.due')} {fmtDueShort(task.dueAt, lang)}
          </span>
        )}
      </div>
      {task.status === 'awaiting_confirmation' && (
        <div className="review-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="review-btn accept"
            title={t('drawer.acceptTitle')}
            onClick={() =>
              action.mutate(
                { id: task.id, action: 'archive' },
                { onError: (e) => alert(t('alert.opFailed', { e: e.message })) },
              )
            }
          >
            {t('drawer.accept')}
          </button>
          <button className="review-btn changes" onClick={() => onOpen({ reject: true })}>
            {t('drawer.requestChanges')}
          </button>
        </div>
      )}
    </article>
  )
}
