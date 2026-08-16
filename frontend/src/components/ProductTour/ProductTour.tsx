import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import {
  computePlacement,
  createdTaskSelector,
  createMissingWatcher,
  isLastStep,
  markTourCompleted,
  placeTooltip,
  resolveStep,
  shouldSkipStep,
  targetSelector,
  type TooltipPosition,
  type TourCtx,
} from './logic'
import { TOUR_STEPS } from './steps'

// The interactive product tour: an overlay on the REAL UI. ONLY the current
// highlighted target — plus the coachmark's own buttons — stays clickable;
// everything else is dimmed and blocked. Steps advance through real
// interactions (clicks, typed input, newly rendered elements) or an explicit
// Next button for informational steps. Only Finish writes
// lk-tour-v1-completed.

interface Box {
  el: HTMLElement
  rect: DOMRect
}

interface CoachmarkProps {
  label: string
  title: string
  body: string
  closeTitle: string
  onClose: () => void
  actions: ReactNode
  className?: string
  style?: React.CSSProperties
  innerRef?: React.Ref<HTMLDivElement>
}

// Shared coachmark chrome: step counter + close, title, body, actions.
function Coachmark({ label, title, body, closeTitle, onClose, actions, className, style, innerRef }: CoachmarkProps) {
  return (
    <div className={className ? `tour-tooltip ${className}` : 'tour-tooltip'} style={style} ref={innerRef}>
      <div className="tour-tooltip-head">
        <span className="tour-step">{label}</span>
        <button type="button" className="tour-close" onClick={onClose} title={closeTitle}>
          ×
        </button>
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="tour-actions">{actions}</div>
    </div>
  )
}

export function ProductTour({
  createdTaskId,
  onExit,
}: {
  /** Task id captured from the create mutation result (preferred over DOM sniffing). */
  createdTaskId?: string | null
  onExit: () => void
}) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [ctx, setCtx] = useState<TourCtx>({ createdTaskId: null })
  const [box, setBox] = useState<Box | null>(null)
  const [missing, setMissing] = useState(false)
  const [size, setSize] = useState({ width: 264, height: 140 })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const scrollAtRef = useRef(0)

  const step = resolveStep(TOUR_STEPS, index)
  const last = isLastStep(TOUR_STEPS, index)
  const knownId = createdTaskId ?? ctx.createdTaskId

  const goNext = useCallback(() => {
    setIndex((i) => (i < TOUR_STEPS.length - 1 ? i + 1 : i))
  }, [])

  const goTo = useCallback((id: string) => {
    setIndex((i) => {
      const at = TOUR_STEPS.findIndex((s) => s.id === id)
      return at >= 0 ? at : i
    })
  }, [])

  // Skip / close / Esc: leave WITHOUT writing completion.
  const skip = useCallback(() => onExit(), [onExit])

  // Only a full Finish writes completion.
  const finish = useCallback(() => {
    markTourCompleted()
    onExit()
  }, [onExit])

  // Per-step DOM glue: locate the target, keep it visible, and advance on
  // real interactions. All the policy (skip on missing, goTo, placement)
  // lives in the pure logic module.
  useEffect(() => {
    const s = resolveStep(TOUR_STEPS, index)
    if (!s) return

    scrollAtRef.current = 0

    // Sanctioned programmatic UI action (e.g. close the drawer via its real
    // close button) before this step's target is located.
    if (s.preClick) {
      document.querySelector<HTMLElement>(s.preClick)?.click()
    }

    let alive = true
    let done = false
    setMissing(false)
    const advanceOnce = () => {
      if (!alive || done) return
      done = true
      goNext()
    }

    const sel = targetSelector(s, { createdTaskId: knownId })

    // target-appear steps advance when the task created during the tour
    // shows up. Preferred: the id captured from the create mutation result
    // (exact selector, no false positives). Fallback: snapshot existing
    // data-tour-task-id values and advance on the first new one.
    const seenIds = new Set<string>()
    if (s.advance === 'target-appear') {
      document.querySelectorAll('[data-tour-task-id]').forEach((n) => {
        const id = n.getAttribute('data-tour-task-id')
        if (id) seenIds.add(id)
      })
    }

    // One-shot missing-target timer with a fired guard: once it resolves
    // (skip / goTo / fallback card), further update() calls must not
    // re-arm it — re-arming + setMissing(false) inside the observer loop
    // is what used to leave the screen permanently dimmed.
    const missing = createMissingWatcher(s.timeoutMs ?? 4000)

    const clearMissing = () => {
      missing.reset()
      setMissing(false)
    }

    let inputTimer: number | null = null

    const update = () => {
      if (!alive) return

      if (s.advance === 'target-appear') {
        if (createdTaskId) {
          if (document.querySelector(createdTaskSelector(createdTaskId))) {
            advanceOnce()
            return
          }
        } else {
          const nodes = document.querySelectorAll('[data-tour-task-id]')
          for (const n of nodes) {
            const id = n.getAttribute('data-tour-task-id')
            if (id && !seenIds.has(id)) {
              setCtx({ createdTaskId: id })
              advanceOnce()
              return
            }
          }
        }
      }

      const el = sel ? document.querySelector<HTMLElement>(sel) : null
      if (!el) {
        // Centered steps (no target, e.g. the finish card) have nothing to
        // wait for — never run the missing-target policy for them.
        if (!sel) {
          setBox(null)
          return
        }
        missing.start(() => {
          if (!alive) return
          if (shouldSkipStep(s, true)) advanceOnce()
          else if (s.onMissingGoTo) goTo(s.onMissingGoTo)
          else setMissing(true)
        })
        // Keep the previous coachmark only while its element is still
        // connected; otherwise hide it until the new target appears.
        setBox((prev) => (prev && prev.el.isConnected ? prev : null))
        return
      }
      clearMissing()

      const rect = el.getBoundingClientRect()
      setBox({ el, rect })

      // Bring the target back when it has scrolled out of the middle band.
      const vw = window.innerWidth
      const vh = window.innerHeight
      const out =
        rect.bottom < vh * 0.15 || rect.top > vh * 0.85 || rect.right < vw * 0.15 || rect.left > vw * 0.85
      if (out && Date.now() - scrollAtRef.current > 600) {
        scrollAtRef.current = Date.now()
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      }
    }

    const onClick = (e: MouseEvent) => {
      if (!alive || s.advance !== 'target-click') return
      const el = sel ? document.querySelector<HTMLElement>(sel) : null
      if (el && e.target instanceof Node && el.contains(e.target)) advanceOnce()
    }

    if (s.advance === 'target-input') {
      inputTimer = window.setInterval(() => {
        if (!alive) return
        const el = sel ? document.querySelector<HTMLElement>(sel) : null
        if (!el) return
        const input = s.inputSelector
          ? el.querySelector<HTMLInputElement>(s.inputSelector)
          : (el as HTMLInputElement)
        if (input && input.value.trim()) advanceOnce()
      }, 250)
    }

    const mo = new MutationObserver(update)
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-tour', 'data-tour-task-id'],
    })
    const onScroll = () => update()
    const onResize = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('click', onClick, true)

    const t0 = window.setTimeout(update, 60)

    return () => {
      alive = false
      window.clearTimeout(t0)
      missing.reset()
      if (inputTimer != null) window.clearInterval(inputTimer)
      mo.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('click', onClick, true)
    }
  }, [index, ctx, createdTaskId, knownId, goNext, goTo])

  // Esc = unexpected exit: never marks completion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onExit])

  // Measure the real tooltip size so placement math can clamp it.
  useLayoutEffect(() => {
    const el = tooltipRef.current
    if (!el) return
    const measure = () => {
      setSize((prev) => {
        const w = el.offsetWidth
        const h = el.offsetHeight
        return prev.width === w && prev.height === h ? prev : { width: w, height: h }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step, missing])

  const pos = useMemo(() => {
    if (!step || !box || missing || !step.target) return null
    const vp = { width: window.innerWidth, height: window.innerHeight }
    const placement = computePlacement(box.rect, vp, step.placement)
    return placeTooltip(box.rect, vp, placement, size)
  }, [step, box, missing, size])

  if (!step) return null

  const centered = !step.target // finish card
  const showMissing = missing && !!step.target

  const arrowStyle = (pos: TooltipPosition | null): React.CSSProperties | null => {
    if (!pos?.arrow) return null
    const s = pos.arrow
    const h = size.height
    if (s.side === 'top') return { left: pos.left + s.offset - 6, top: pos.top - 5 }
    if (s.side === 'bottom') return { left: pos.left + s.offset - 6, top: pos.top + h - 5 }
    if (s.side === 'left') return { left: pos.left - 5, top: pos.top + s.offset - 6 }
    return { left: pos.left + size.width - 5, top: pos.top + s.offset - 6 }
  }

  const titleText = showMissing ? t('tour.missingTitle') : t(step.titleKey)
  const bodyText = showMissing ? t('tour.missingBody') : t(step.bodyKey)
  const stepLabel = t('tour.step', { current: index + 1, total: TOUR_STEPS.length })
  const skipTitle = t('tour.skip')

  const arrowPos = arrowStyle(pos)

  return (
    <div className="tour-root">
      {box && !showMissing ? (
        <>
          <div className="tour-block" style={{ top: 0, left: 0, right: 0, height: box.rect.top }} />
          <div
            className="tour-block"
            style={{ top: box.rect.bottom, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="tour-block"
            style={{ top: box.rect.top, bottom: box.rect.bottom, left: 0, width: box.rect.left }}
          />
          <div
            className="tour-block"
            style={{ top: box.rect.top, bottom: box.rect.bottom, left: box.rect.right, right: 0 }}
          />
          <div
            className="tour-hole"
            style={{
              left: box.rect.left - 3,
              top: box.rect.top - 3,
              width: box.rect.width + 6,
              height: box.rect.height + 6,
            }}
          />
        </>
      ) : (
        <div className="tour-block" style={{ top: 0, left: 0, right: 0, bottom: 0 }} />
      )}

      {arrowPos && <div className="tour-arrow" style={arrowPos} />}

      {centered || showMissing ? (
        <Coachmark
          className="tour-tooltip-center"
          label={stepLabel}
          title={titleText}
          body={bodyText}
          closeTitle={skipTitle}
          onClose={skip}
          actions={
            <>
              <button type="button" className="btn sm" onClick={skip}>
                {skipTitle}
              </button>
              {showMissing ? (
                <button type="button" className="btn primary sm" onClick={goNext}>
                  {t('tour.next')}
                </button>
              ) : (
                <button type="button" className="btn primary sm" onClick={finish}>
                  {t('tour.finish')}
                </button>
              )}
            </>
          }
        />
      ) : pos ? (
        <Coachmark
          innerRef={tooltipRef}
          style={{ left: pos.left, top: pos.top }}
          label={stepLabel}
          title={t(step.titleKey)}
          body={t(step.bodyKey)}
          closeTitle={skipTitle}
          onClose={skip}
          actions={
            <>
              <button type="button" className="btn sm" onClick={skip}>
                {skipTitle}
              </button>
              {step.advance === 'next-button' ? (
                <button type="button" className="btn primary sm" onClick={last ? finish : goNext}>
                  {last ? t('tour.finish') : t('tour.next')}
                </button>
              ) : (
                <span className="tour-hint">
                  {t(step.advance === 'target-input' ? 'tour.hint.input' : 'tour.hint.click')}
                </span>
              )}
            </>
          }
        />
      ) : null}
    </div>
  )
}
