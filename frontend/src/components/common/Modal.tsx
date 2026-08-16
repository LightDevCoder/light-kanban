import { useEffect, type ReactNode } from 'react'

/** Centered modal: backdrop click or Escape closes. */
export function Modal({
  onClose,
  className,
  dataTour,
  children,
}: {
  onClose: () => void
  className?: string
  /** Stable marker for the interactive product tour (data-tour attribute). */
  dataTour?: string
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={className ? `modal ${className}` : 'modal'} data-tour={dataTour}>
        {children}
      </div>
    </div>
  )
}
