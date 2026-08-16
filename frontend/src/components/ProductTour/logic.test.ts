import { describe, expect, it } from 'vitest'
import {
  TOUR_STORAGE_KEY,
  computePlacement,
  cutoutSelector,
  getNextStep,
  isLastStep,
  isTourCompleted,
  markTourCompleted,
  nextStepIndex,
  placeTooltip,
  resolveStep,
  shouldSkipStep,
  stepIndexOf,
  targetSelector,
  type StorageLike,
  type TourStep,
} from './logic'

const step = (p: Partial<TourStep> = {}): TourStep => ({
  id: 'a',
  target: '[data-tour="a"]',
  titleKey: 'tour.a.title',
  bodyKey: 'tour.a.body',
  advance: 'next-button',
  ...p,
})

describe('tour completion persistence', () => {
  const storage = (v: string | null): StorageLike => ({
    getItem: () => v,
    setItem: () => {},
  })

  it('is not completed when the key is missing', () => {
    expect(isTourCompleted(storage(null))).toBe(false)
  })

  it('is completed only when the key equals "1"', () => {
    expect(isTourCompleted(storage('1'))).toBe(true)
    expect(isTourCompleted(storage('0'))).toBe(false)
    expect(isTourCompleted(storage('true'))).toBe(false)
  })

  it('markTourCompleted writes "1" under lk-tour-v1-completed', () => {
    const calls: Array<[string, string]> = []
    const store: StorageLike = {
      getItem: () => null,
      setItem: (k, v) => {
        calls.push([k, v])
      },
    }
    markTourCompleted(store)
    expect(calls).toEqual([[TOUR_STORAGE_KEY, '1']])
  })
})

describe('step navigation', () => {
  const steps = [step({ id: 's1' }), step({ id: 's2' }), step({ id: 's3' })]

  it('resolveStep returns the step at a valid index', () => {
    expect(resolveStep(steps, 1)?.id).toBe('s2')
  })

  it('resolveStep returns null out of range', () => {
    expect(resolveStep(steps, -1)).toBeNull()
    expect(resolveStep(steps, 3)).toBeNull()
  })

  it('nextStepIndex advances or signals finished', () => {
    expect(nextStepIndex(steps, 0)).toBe(1)
    expect(nextStepIndex(steps, 2)).toBeNull()
  })

  it('getNextStep returns the next step or null', () => {
    expect(getNextStep(steps, 0)?.id).toBe('s2')
    expect(getNextStep(steps, 2)).toBeNull()
  })

  it('stepIndexOf finds a step by id', () => {
    expect(stepIndexOf(steps, 's2')).toBe(1)
    expect(stepIndexOf(steps, 'nope')).toBe(-1)
  })

  it('isLastStep is true only on the final step', () => {
    expect(isLastStep(steps, 2)).toBe(true)
    expect(isLastStep(steps, 1)).toBe(false)
  })
})

describe('shouldSkipStep', () => {
  it('skips only optional steps whose target is missing', () => {
    expect(shouldSkipStep(step({ optional: true }), true)).toBe(true)
    expect(shouldSkipStep(step({ optional: true }), false)).toBe(false)
    expect(shouldSkipStep(step(), true)).toBe(false)
    expect(shouldSkipStep(step(), false)).toBe(false)
  })
})

describe('targetSelector', () => {
  it('returns the raw selector when it has no placeholder', () => {
    expect(targetSelector(step({ target: '[data-tour="x"]' }), {})).toBe('[data-tour="x"]')
  })

  it('substitutes the created task id placeholder', () => {
    expect(
      targetSelector(step({ target: '[data-tour-task-id="{createdTaskId}"]' }), {
        createdTaskId: 'abc-123',
      }),
    ).toBe('[data-tour-task-id="abc-123"]')
  })

  it('returns null when the placeholder cannot be filled', () => {
    expect(targetSelector(step({ target: '[data-tour-task-id="{createdTaskId}"]' }), {})).toBeNull()
    expect(
      targetSelector(step({ target: '[data-tour-task-id="{createdTaskId}"]' }), {
        createdTaskId: null,
      }),
    ).toBeNull()
  })

  it('returns null when the step has no target', () => {
    expect(targetSelector(step({ target: undefined }), {})).toBeNull()
  })
})

describe('cutoutSelector', () => {
  it('prefers the explicit cutout region', () => {
    expect(cutoutSelector(step({ target: '[data-tour="x"]', cutout: '[data-tour="y"]' }), {})).toBe(
      '[data-tour="y"]',
    )
  })

  it('falls back to the target selector', () => {
    expect(cutoutSelector(step({ target: '[data-tour="x"]' }), {})).toBe('[data-tour="x"]')
  })

  it('is null for a centered (target-less) step', () => {
    expect(cutoutSelector(step({ target: undefined }), {})).toBeNull()
  })
})

describe('computePlacement', () => {
  const vp = { width: 1280, height: 800 }

  it('places below when the target is near the top', () => {
    expect(computePlacement({ left: 600, top: 40, width: 80, height: 40 }, vp)).toBe('bottom')
  })

  it('places above when the target is near the bottom', () => {
    expect(computePlacement({ left: 600, top: 700, width: 80, height: 40 }, vp)).toBe('top')
  })

  it('places right when the target is near the left edge', () => {
    expect(computePlacement({ left: 0, top: 300, width: 80, height: 40 }, vp)).toBe('right')
  })

  it('places left when the target is near the right edge', () => {
    expect(computePlacement({ left: 1200, top: 300, width: 80, height: 40 }, vp)).toBe('left')
  })

  it('respects a preferred side when it has room', () => {
    expect(computePlacement({ left: 600, top: 300, width: 80, height: 40 }, vp, 'left')).toBe('left')
  })

  it('falls back to the roomiest side when the preferred side is cramped', () => {
    expect(computePlacement({ left: 2, top: 300, width: 80, height: 40 }, vp, 'left')).toBe('right')
  })
})

describe('placeTooltip', () => {
  const vp = { width: 1280, height: 800 }
  const size = { width: 264, height: 120 }
  const GAP = 12
  const MARGIN = 12

  it('places below with the arrow pointing at the target center', () => {
    const target = { left: 600, top: 100, width: 80, height: 40 }
    const p = placeTooltip(target, vp, 'bottom', size)
    expect(p.left).toBe(600 + 40 - 132)
    expect(p.top).toBe(100 + 40 + GAP)
    expect(p.arrow).toEqual({ side: 'top', offset: 132 })
  })

  it('clamps inside the viewport near the right edge', () => {
    const target = { left: 1200, top: 100, width: 80, height: 40 }
    const p = placeTooltip(target, vp, 'bottom', size)
    expect(p.left).toBe(vp.width - size.width - MARGIN)
    expect(p.arrow).toEqual({ side: 'top', offset: 236 })
  })

  it('clamps inside the viewport near the top edge', () => {
    const target = { left: 600, top: 0, width: 80, height: 40 }
    const p = placeTooltip(target, vp, 'top', size)
    expect(p.top).toBe(MARGIN)
  })

  it('places left with the tooltip vertically centered on the target', () => {
    const target = { left: 800, top: 300, width: 80, height: 40 }
    const p = placeTooltip(target, vp, 'left', size)
    expect(p.left).toBe(800 - GAP - size.width)
    expect(p.top).toBe(300 + 20 - 60)
    expect(p.arrow).toEqual({ side: 'right', offset: 60 })
  })

  it('never leaves the viewport for any side', () => {
    const corners = [
      { left: 0, top: 0, width: 60, height: 30 },
      { left: 1220, top: 0, width: 60, height: 30 },
      { left: 0, top: 770, width: 60, height: 30 },
      { left: 1220, top: 770, width: 60, height: 30 },
    ]
    for (const target of corners) {
      for (const placement of ['top', 'bottom', 'left', 'right'] as const) {
        const p = placeTooltip(target, vp, placement, size)
        expect(p.left).toBeGreaterThanOrEqual(0)
        expect(p.top).toBeGreaterThanOrEqual(0)
        expect(p.left + size.width).toBeLessThanOrEqual(vp.width)
        expect(p.top + size.height).toBeLessThanOrEqual(vp.height)
      }
    }
  })
})
