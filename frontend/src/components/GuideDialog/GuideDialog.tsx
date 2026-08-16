import { useState } from 'react'
import { useI18n } from '../../i18n'
import { Modal } from '../common/Modal'

const WIZARD_KEY = 'lk-wizard-seen'

export function wizardSeen(): boolean {
  return Boolean(localStorage.getItem(WIZARD_KEY))
}

// First-run guide: same four steps as the README Quick Start.
export function GuideDialog({ onClose }: { onClose: () => void }) {
  const { t, wizardSteps } = useI18n()
  const [index, setIndex] = useState(0)
  const last = wizardSteps.length - 1

  const finish = () => {
    localStorage.setItem(WIZARD_KEY, '1')
    onClose()
  }

  const step = wizardSteps[index]

  return (
    <Modal onClose={finish} className="wizard-modal">
      <h3>{t('wizard.welcome')}</h3>
      <div className="wizard-steps">
        <h4>{step.title}</h4>
        {step.blocks.map((b, i) => {
          if (b.type === 'code') return <pre key={i}>{b.text}</pre>
          if (b.type === 'list')
            return (
              <ul key={i}>
                {(b.items ?? []).map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )
          return <p key={i}>{b.text}</p>
        })}
      </div>
      <div className="wizard-dots">
        {wizardSteps.map((_, i) => (
          <span key={i} className={'wizard-dot' + (i === index ? ' active' : i < index ? ' done' : '')} />
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={finish}>
          {t('wizard.skip')}
        </button>
        {index > 0 && (
          <button type="button" className="btn" onClick={() => setIndex(index - 1)}>
            {t('wizard.prev')}
          </button>
        )}
        {index < last && (
          <button type="button" className="btn primary" onClick={() => setIndex(index + 1)}>
            {t('wizard.next')}
          </button>
        )}
        {index === last && (
          <button type="button" className="btn primary" onClick={finish}>
            {t('wizard.finish')}
          </button>
        )}
      </div>
    </Modal>
  )
}
