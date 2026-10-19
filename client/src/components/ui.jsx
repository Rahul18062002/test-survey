import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ---------- toasts ----------

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------- confirm dialog ----------

const ConfirmContext = createContext(async () => false)
export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const confirm = useCallback(
    (opts) => new Promise((resolve) => setState({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve })),
    []
  )
  const close = (v) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Are you sure?'} onClose={() => close(false)}>
          <p>{state.message}</p>
          <div className="row end gap">
            <button className="btn" onClick={() => close(false)}>
              {state.cancel || 'Cancel'}
            </button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
              {state.ok || 'Continue'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function Modal({ title, children, onClose, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- small pieces ----------

/** Inline, contextual help: a short explanation right where the question comes up. */
export function Help({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="help">
      <button type="button" className="help-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="What is this?">
        ?
      </button>
      {open && <span className="help-pop">{children}</span>}
    </span>
  )
}

export function AppIcon({ src, size = 22, name = '' }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <span className="app-icon app-icon-fallback" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">
        {name.charAt(0)}
      </span>
    )
  }
  return <img className="app-icon" src={src} alt="" width={size} height={size} onError={() => setFailed(true)} />
}

export function Spinner({ label }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const run = useCallback(async () => {
    try {
      const data = await fn()
      setState({ loading: false, data, error: null })
    } catch (error) {
      setState((s) => ({ loading: false, data: s.data, error: error.message }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    run()
  }, [run])
  return { ...state, reload: run }
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div className="note note-error" role="alert">
      {children}
    </div>
  )
}
