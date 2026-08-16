import type { TourStep } from './logic'

// The interactive first-run tour. Every step drives the REAL UI: the
// coachmark anchors at `target` (a stable data-tour attribute), `cutout`
// marks the region that stays clickable (defaults to the target), and
// `advance` decides how the user moves on. All visible text lives in the
// i18n dictionaries (titleKey/bodyKey); the selectors must stay attribute
// selectors only so small UI tweaks never break the tour.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'create-task',
    target: '[data-tour="create-task"]',
    titleKey: 'tour.createTask.title',
    bodyKey: 'tour.createTask.body',
    advance: 'target-click',
  },
  {
    id: 'workspace-path',
    target: '[data-tour="workspace-path"]',
    cutout: '[data-tour="create-dialog"]',
    titleKey: 'tour.workspacePath.title',
    bodyKey: 'tour.workspacePath.body',
    advance: 'target-input',
    inputSelector: 'input',
  },
  {
    id: 'task-title',
    target: '[data-tour="task-title"]',
    cutout: '[data-tour="create-dialog"]',
    titleKey: 'tour.taskTitle.title',
    bodyKey: 'tour.taskTitle.body',
    advance: 'target-input',
  },
  {
    id: 'create-submit',
    target: '[data-tour="create-submit"]',
    cutout: '[data-tour="create-dialog"]',
    titleKey: 'tour.createSubmit.title',
    bodyKey: 'tour.createSubmit.body',
    advance: 'target-appear',
    appearSelector: '[data-tour-task-id]',
    onMissingGoTo: 'create-task',
  },
  {
    id: 'task-card',
    target: '[data-tour-task-id="{createdTaskId}"]',
    titleKey: 'tour.taskCard.title',
    bodyKey: 'tour.taskCard.body',
    advance: 'target-click',
  },
  {
    id: 'task-drawer',
    target: '[data-tour="task-drawer"]',
    titleKey: 'tour.taskDrawer.title',
    bodyKey: 'tour.taskDrawer.body',
    advance: 'next-button',
  },
  {
    id: 'open-folder',
    target: '[data-tour="open-folder"]',
    cutout: '[data-tour="task-drawer"]',
    titleKey: 'tour.openFolder.title',
    bodyKey: 'tour.openFolder.body',
    advance: 'next-button',
  },
  {
    id: 'task-status',
    target: '[data-tour="task-status"]',
    cutout: '[data-tour="task-drawer"]',
    titleKey: 'tour.workflow.title',
    bodyKey: 'tour.workflow.body',
    advance: 'next-button',
  },
  {
    id: 'review-column',
    target: '[data-tour="review-column"]',
    titleKey: 'tour.review.title',
    bodyKey: 'tour.review.body',
    advance: 'next-button',
    preClick: '[data-tour="drawer-close"]',
  },
  {
    id: 'settings',
    target: '[data-tour="settings"]',
    titleKey: 'tour.settings.title',
    bodyKey: 'tour.settings.body',
    advance: 'target-click',
  },
  {
    id: 'settings-archive',
    target: '[data-tour="settings-archive"]',
    titleKey: 'tour.settingsArchive.title',
    bodyKey: 'tour.settingsArchive.body',
    advance: 'target-click',
  },
  {
    id: 'archive-dialog',
    target: '[data-tour="archive-dialog"]',
    titleKey: 'tour.archive.title',
    bodyKey: 'tour.archive.body',
    advance: 'next-button',
  },
  {
    id: 'archive-open-folder',
    target: '[data-tour="archive-open-folder"]',
    cutout: '[data-tour="archive-dialog"]',
    titleKey: 'tour.archiveFolder.title',
    bodyKey: 'tour.archiveFolder.body',
    advance: 'next-button',
    optional: true,
    timeoutMs: 3500,
  },
  {
    id: 'finish',
    titleKey: 'tour.finish.title',
    bodyKey: 'tour.finish.body',
    advance: 'next-button',
  },
]
