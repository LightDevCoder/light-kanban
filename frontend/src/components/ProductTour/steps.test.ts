import { describe, expect, it } from 'vitest'
import zh from '../../i18n/zh'
import en from '../../i18n/en'
import { TOUR_STEPS } from './steps'

const ATTR_SELECTOR = /^\[data-tour[-a-z]*(=".*")?\]$/

describe('tour steps data', () => {
  it('has unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts with the create flow and ends with the finish card', () => {
    expect(TOUR_STEPS[0].id).toBe('create-task')
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].id).toBe('finish')
  })

  it('targets stable data-tour attributes only (no nth-child / class / text selectors)', () => {
    for (const s of TOUR_STEPS) {
      for (const sel of [s.target, s.cutout, s.preClick, s.appearSelector]) {
        if (sel == null) continue
        expect(sel, `${s.id}: ${sel}`).toMatch(ATTR_SELECTOR)
      }
      if (s.inputSelector != null) {
        expect(s.inputSelector, `${s.id} inputSelector`).toMatch(/^(input|\[data-tour[-a-z]*(=".*")?\])$/)
      }
    }
  })

  it('resolves every title/body key in both dictionaries', () => {
    const zhFlat = zh as unknown as Record<string, unknown>
    const enFlat = en as unknown as Record<string, unknown>
    for (const s of TOUR_STEPS) {
      expect(zhFlat[s.titleKey], s.titleKey).toBeTypeOf('string')
      expect(zhFlat[s.bodyKey], s.bodyKey).toBeTypeOf('string')
      expect(enFlat[s.titleKey], s.titleKey).toBeTypeOf('string')
      expect(enFlat[s.bodyKey], s.bodyKey).toBeTypeOf('string')
    }
  })

  it('marks only the archive folder step optional', () => {
    const optional = TOUR_STEPS.filter((s) => s.optional)
    expect(optional.map((s) => s.id)).toEqual(['archive-open-folder'])
  })

  it('covers the full recommended flow in order', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'create-task',
      'workspace-path',
      'task-title',
      'create-submit',
      'task-card',
      'task-drawer',
      'open-folder',
      'task-status',
      'review-column',
      'settings',
      'settings-archive',
      'archive-dialog',
      'archive-open-folder',
      'finish',
    ])
  })

  it('only the target-appear step watches for a new task card', () => {
    const appear = TOUR_STEPS.filter((s) => s.advance === 'target-appear')
    expect(appear.map((s) => s.id)).toEqual(['create-submit'])
    expect(appear[0].appearSelector).toBe('[data-tour-task-id]')
  })

  it('restarts the create flow when the submit button disappears', () => {
    const submit = TOUR_STEPS.find((s) => s.id === 'create-submit')
    expect(submit?.onMissingGoTo).toBe('create-task')
  })

  it('closes the drawer before pointing at the review column', () => {
    const review = TOUR_STEPS.find((s) => s.id === 'review-column')
    expect(review?.preClick).toBe('[data-tour="drawer-close"]')
  })
})
