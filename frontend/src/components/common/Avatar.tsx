import type { Agent } from '../../types'
import { avatarColor } from '../../utils/color'

export function isImageAvatar(v: string | null | undefined): v is string {
  return (
    typeof v === 'string' &&
    (v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'))
  )
}

/** Round agent avatar: image wins, then legacy text/emoji, then hash color + initial. */
export function Avatar({ agent, large }: { agent: Agent; large?: boolean }) {
  const label = agent.name || agent.id
  const cls = 'avatar' + (large ? ' lg' : '')
  if (isImageAvatar(agent.avatar)) {
    return (
      <span className={cls} title={label}>
        <img src={agent.avatar} alt={label} />
      </span>
    )
  }
  if (agent.avatar) {
    // Legacy text/emoji avatar from an earlier version or manual pre-config.
    return (
      <span className={cls} title={label} style={{ background: 'var(--hover)', color: 'var(--text-2)' }}>
        {agent.avatar}
      </span>
    )
  }
  const initial = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className={cls} title={label} style={{ background: avatarColor(agent.id) }}>
      {initial}
    </span>
  )
}
