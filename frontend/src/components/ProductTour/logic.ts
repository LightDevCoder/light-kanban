// Pure, DOM-free logic for the interactive product tour. Everything here is
// unit-tested (logic.test.ts / steps.test.ts); the ProductTour component is
// a thin DOM glue around it. Keep this module free of React and browser
// globals so the tests run under plain Node. (The I18nKey import is
// type-only — erased at runtime.)

import type { I18nKey } from '../../i18n/keys'

export const TOUR_STORAGE_KEY = 'lk-tour-v1-completed'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export type TourAdvance = 'next-button' | 'target-click' | 'target-appear' | 'target-input'

export interface TourStep {
  id: string
  /** data-tour attribute the coachmark anchors at; undefined = centered card. */
  target?: string
  /** Region that stays clickable (defaults to the target). */
  cutout?: string
  titleKey: I18nKey
  bodyKey: I18nKey
  placement?: TourPlacement
  advance: TourAdvance
  /** For 'target-input': the input inside the target to watch (defaults to the target itself). */
  inputSelector?: string
  /** For 'target-appear': a newly appearing element matching this selector advances the step. */
  appearSelector?: string
  /** Missing target after timeout → auto-skip. */
  optional?: boolean
  /** Missing target after timeout → jump to this step id. */
  onMissingGoTo?: string
  /** Real element the tour clicks before locating the step target (e.g. close the drawer). */
  preClick?: string
  /** How long to wait for the target before giving up (default 4000 ms). */
  timeoutMs?: number
}

export interface TourCtx {
  createdTaskId?: string | null
}

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The tour auto-starts only when this is false (key !== "1"). */
export function isTourCompleted(storage?: StorageLike | null): boolean {
  const s = storage ?? defaultStorage()
  if (!s) return false
  return s.getItem(TOUR_STORAGE_KEY) === '1'
}

/** Only a full Finish writes completion — Skip / Esc / reload never call this. */
export function markTourCompleted(storage?: StorageLike | null): void {
  const s = storage ?? defaultStorage()
  if (!s) return
  s.setItem(TOUR_STORAGE_KEY, '1')
}

export function resolveStep(steps: TourStep[], index: number): TourStep | null {
  return index >= 0 && index < steps.length ? steps[index] : null
}

/** Next index, or null when the current step is the last one (finished). */
export function nextStepIndex(steps: TourStep[], index: number): number | null {
  return index < steps.length - 1 ? index + 1 : null
}

export function getNextStep(steps: TourStep[], index: number): TourStep | null {
  const next = nextStepIndex(steps, index)
  return next === null ? null : steps[next]
}

export function stepIndexOf(steps: TourStep[], id: string): number {
  return steps.findIndex((s) => s.id === id)
}

export function isLastStep(steps: TourStep[], index: number): boolean {
  return index === steps.length - 1
}

/** Optional steps are skipped automatically when their target never shows up. */
export function shouldSkipStep(step: TourStep, targetMissing: boolean): boolean {
  return step.optional === true && targetMissing
}

const CREATED_TOKEN = '{createdTaskId}'

/** Selector for the step's coachmark anchor; null when it cannot be resolved. */
export function targetSelector(step: TourStep, ctx: TourCtx): string | null {
  const raw = step.target
  if (!raw) return null
  if (raw.includes(CREATED_TOKEN)) {
    const id = ctx.createdTaskId
    if (!id) return null
    return raw.replaceAll(CREATED_TOKEN, id)
  }
  return raw
}

/** Exact card selector for a task created during the tour. */
export function createdTaskSelector(id: string): string {
  return `[data-tour-task-id="${id.replaceAll('"', '')}"]`
}

/** Selector for the clickable region (cutout); defaults to the target. */
export function cutoutSelector(step: TourStep, ctx: TourCtx): string | null {
  return step.cutout ?? targetSelector(step, ctx)
}

// ---------- tooltip geometry (pure) ----------

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface ViewportLike {
  width: number
  height: number
}

const MIN_SIDE_ROOM = 80

/**
 * Pick the tooltip side with the most free space; a preferred side wins
 * when it has at least MIN_SIDE_ROOM pixels. Tie-break: bottom, top, right, left.
 */
export function computePlacement(
  target: RectLike,
  vp: ViewportLike,
  preferred?: TourPlacement,
): TourPlacement {
  const space: Record<TourPlacement, number> = {
    top: target.top,
    bottom: vp.height - (target.top + target.height),
    left: target.left,
    right: vp.width - (target.left + target.width),
  }
  if (preferred && space[preferred] >= MIN_SIDE_ROOM) return preferred
  const order: TourPlacement[] = ['bottom', 'top', 'right', 'left']
  let best: TourPlacement = 'bottom'
  for (const side of order) if (space[side] > space[best]) best = side
  return best
}

export interface TooltipPosition {
  left: number
  top: number
  /** Which tooltip edge carries the arrow and its offset along that edge. */
  arrow: { side: 'top' | 'bottom' | 'left' | 'right'; offset: number } | null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * Fixed-position tooltip near the target, clamped into the viewport
 * (gap/margin in px). Pure: no DOM access, fully unit-tested.
 */
export function placeTooltip(
  target: RectLike,
  vp: ViewportLike,
  placement: TourPlacement,
  size: { width: number; height: number },
  gap = 12,
  margin = 12,
): TooltipPosition {
  const cx = target.left + target.width / 2
  const cy = target.top + target.height / 2
  const leftSpan = vp.width - size.width - margin
  const topSpan = vp.height - size.height - margin

  if (placement === 'top' || placement === 'bottom') {
    const left = clamp(cx - size.width / 2, margin, leftSpan)
    const top =
      placement === 'bottom'
        ? clamp(target.top + target.height + gap, margin, topSpan)
        : clamp(target.top - gap - size.height, margin, topSpan)
    const side = placement === 'bottom' ? 'top' : 'bottom'
    return { left, top, arrow: { side, offset: clamp(cx - left, 16, size.width - 16) } }
  }

  const top = clamp(cy - size.height / 2, margin, topSpan)
  const left =
    placement === 'right'
      ? clamp(target.left + target.width + gap, margin, leftSpan)
      : clamp(target.left - gap - size.width, margin, leftSpan)
  const side = placement === 'right' ? 'left' : 'right'
  return { left, top, arrow: { side, offset: clamp(cy - top, 16, size.height - 16) } }
}
