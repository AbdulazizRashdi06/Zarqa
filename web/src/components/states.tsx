import { useEffect, useRef, type ElementType, type ReactNode } from 'react'
import { t } from '../i18n'
import { BigButton, ZarqaBubble } from './ui'
import s from './states.module.css'

/**
 * Shared page states. Every screen that loads data uses these three, so a slow or failed load looks and
 * sounds the same everywhere:
 *   loading  -> <LoadingState />
 *   failed   -> <LoadError onRetry={load} />
 *   an action failed -> <InlineError>{error}</InlineError>
 */

/** Centred spinner for a page or section that is loading. Appears after 300ms so fast loads never flash it. */
export function LoadingState({ label = t('common.loading') }: { label?: string }) {
  return (
    <div className={s.loading} role="status" aria-live="polite">
      <span className={s.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/**
 * A load that failed: Zarqa says so and offers Try again. Never show an empty state ("No chats yet") for a
 * failed load. `message` defaults to the generic can't-load line; pass err.message for a server explanation.
 */
export function LoadError({ message = t('common.loadError'), onRetry, busy }: { message?: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className={s.loadError} role="alert">
      <ZarqaBubble mascot="question" alt="" width={70} quiet motion="sway">
        {message}
      </ZarqaBubble>
      <BigButton label={t('common.retry')} onClick={onRetry} busy={busy} disabled={busy} />
    </div>
  )
}

/**
 * An error next to the control it is about, announced by screen readers (role="alert"). Renders nothing when
 * empty, so `<InlineError>{error}</InlineError>` can stay in the tree. `onPaper` for errors inside a Ticket.
 */
export function InlineError({ children, onPaper, id, className }: { children?: ReactNode; onPaper?: boolean; id?: string; className?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className={`${s.inlineError} ${onPaper ? s.inlineErrorPaper : ''} ${className ?? ''}`}>
      {children}
    </p>
  )
}

/** A one-line status at the top of a page ("You were signed out…", "Closed. Undo"). Read out politely. */
export function Notice({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={s.notice} role="status">
      <span>{children}</span>
      {action && (
        <button type="button" className={s.noticeAction} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

/**
 * Text a user wrote (titles, descriptions, messages, names). dir="auto" + unicode-bidi: plaintext lets an
 * Arabic line run right to left inside the English UI, and long words or links wrap instead of overflowing.
 */
export function UserText({ as: Tag = 'span', className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return (
    <Tag dir="auto" className={`user-text ${className ?? ''}`}>
      {children}
    </Tag>
  )
}

/**
 * In-app confirmation as a bottom sheet (use instead of window.confirm). Uses a native <dialog>, so focus is
 * trapped, Esc and the backdrop cancel, and focus returns to the button that opened it.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby="confirm-sheet-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(e) => {
        // A tap on the backdrop (outside the sheet's box) cancels.
        if (e.target === e.currentTarget && !busy) {
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientY < r.top) onCancel()
        }
      }}
    >
      <h2 id="confirm-sheet-title">{title}</h2>
      {body && <p>{body}</p>}
      <InlineError>{error}</InlineError>
      <BigButton label={confirmLabel} onClick={onConfirm} busy={busy} disabled={busy} />
      <button type="button" className={s.sheetCancel} onClick={onCancel} disabled={busy}>
        {cancelLabel}
      </button>
    </dialog>
  )
}
