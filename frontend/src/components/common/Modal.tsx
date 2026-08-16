import { useEffect, type ReactNode } from 'react'

/** Centered modal: backdrop click or Escape closes. */
export function Modal({
  onClose,
  className,
  children,
}: {
  onClose: () => void
  className?: string
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
      <div className={className ? `modal ${className}` : 'modal'}>{children}</div>
    </div>
  )
}
