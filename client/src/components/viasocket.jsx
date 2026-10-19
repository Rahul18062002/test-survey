// Connect (viaSocket's popup, opened only through openViasocketConnection) and Pick (dropdowns filled
// with the org's real data through our backend). The browser holds an embed token only to open the
// popup; it never sees the secret or a script_id.
import { useCallback, useEffect, useRef, useState } from 'react'
import { get, post } from '../api.js'
import { useToast, Spinner } from './ui.jsx'

export function useConnect(apps, onChange) {
  const toast = useToast()
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(null)
  const pending = useRef(null)
  const appsRef = useRef(apps)
  appsRef.current = apps

  useEffect(() => {
    get('/viasocket/token')
      .then((d) => setToken(d.token))
      .catch(() => setToken(null))
  }, [])

  useEffect(() => {
    const onMessage = async (event) => {
      const type = event.data?.type
      if (type === 'viasocket_connection_success') {
        const authId = event.data?.data?.id
        const app =
          appsRef.current.find((a) => a.key === pending.current) ||
          appsRef.current.find((a) => a.serviceId === event.data?.serviceId)
        pending.current = null
        if (!app || !authId) return
        setBusy(app.key)
        try {
          const r = await post(`/integrations/${app.key}/connected`, { authId })
          toast(r.message)
          onChange?.()
        } catch (err) {
          toast(err.message, 'error')
        } finally {
          setBusy(null)
        }
      } else if (type === 'viasocket_connection_error') {
        pending.current = null
        toast("The connection didn't go through. Please try again — and make sure you finish signing in.", 'error')
      }
      // 'viasocket_connection_closed' means "nothing yet": a success can still follow, so leave things as they are.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onChange, toast])

  /** Must run straight from the click (no await before it) so the popup isn't blocked. */
  const connect = useCallback(
    (app, { reconnect = false } = {}) => {
      if (!token || typeof window.openViasocketConnection !== 'function') {
        toast("The sign-in window couldn't open. Check that pop-ups aren't blocked for this page, then refresh and try again.", 'error')
        return
      }
      pending.current = app.key
      window.openViasocketConnection(token, app.serviceId, {
        filteredActions: app.filteredActions,
        skipActionSelection: true,
        ...(reconnect && app.authId ? { authId: app.authId } : {})
      })
    },
    [token, toast]
  )

  return { connect, ready: Boolean(token), busy }
}

const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v && v.value !== undefined && v.value !== null && v.value !== '')

function visible(item, values) {
  if (!item.onlyWhen) return true
  return Object.entries(item.onlyWhen).every(([k, want]) => values[k]?.value === want)
}

/** Choices and pickers for one app, in order; dependents clear when what they depend on changes. */
export function AppFields({ app, values, onChange }) {
  const set = (key, val) => {
    const next = { ...values, [key]: val }
    // clear everything that depends on this key, directly or further down
    const cleared = new Set([key])
    let grew = true
    while (grew) {
      grew = false
      for (const p of app.pickers) {
        if (!cleared.has(p.key) && p.dependsOn.some((d) => cleared.has(d))) {
          cleared.add(p.key)
          delete next[p.key]
          grew = true
        }
      }
    }
    next[key] = val
    onChange(next)
  }
  const isSatisfied = (dep) => {
    if (hasValue(values[dep])) return true
    const p = app.pickers.find((x) => x.key === dep)
    return Boolean(p && (p.optional || !visible(p, values)))
  }
  return (
    <div className="stack">
      {app.choices.map((c) => (
        <div className="field" key={c.key}>
          <label>{c.label}</label>
          <div className="segmented">
            {c.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={values[c.key]?.value === o.value ? 'on' : ''}
                onClick={() => set(c.key, { value: o.value, label: o.label })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {app.pickers.filter((p) => visible(p, values)).map((p) => (
        <Picker
          key={p.key}
          appKey={app.key}
          picker={p}
          values={values}
          ready={p.dependsOn.every(isSatisfied)}
          value={values[p.key]}
          onChange={(v) => set(p.key, v)}
        />
      ))}
    </div>
  )
}

export function Picker({ appKey, picker, values, ready, value, onChange }) {
  const [options, setOptions] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const depValues = JSON.stringify(Object.fromEntries(picker.dependsOn.map((d) => [d, values[d]?.value ?? null])))

  useEffect(() => {
    if (!ready) {
      setOptions(null)
      return
    }
    let cancelled = false
    setOptions(null)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ values: depValues, ...(search ? { search } : {}) })
        const d = await get(`/integrations/${appKey}/options/${picker.key}?${q}`)
        if (!cancelled) setOptions(d.options)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }, search ? 350 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [appKey, picker.key, depValues, ready, search])

  const id = `pick-${appKey}-${picker.key}`
  return (
    <div className="field">
      <label htmlFor={id}>{picker.label}</label>
      {picker.hint && <div className="hint">{picker.hint}</div>}
      {!ready ? (
        <div className="muted small">Choose the option above first.</div>
      ) : error ? (
        <div className="note note-error">{error}</div>
      ) : (
        <>
          {picker.searchable && (
            <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${picker.label}`} />
          )}
          {options === null ? (
            <Spinner label="Loading your options…" />
          ) : !options.length ? (
            <div className="muted small">Nothing to choose from here{search ? ' — try a different search' : ''}.</div>
          ) : picker.multiple ? (
            <div className="checklist" id={id}>
              {options.map((o) => {
                const chosen = (value || []).some((v) => v.value === o.value)
                return (
                  <label key={String(o.value)} className="check">
                    <input
                      type="checkbox"
                      checked={chosen}
                      onChange={() => onChange(chosen ? value.filter((v) => v.value !== o.value) : [...(value || []), o])}
                    />
                    {o.label}
                  </label>
                )
              })}
            </div>
          ) : (
            <select
              id={id}
              className="input"
              value={value ? String(options.findIndex((o) => o.value === value.value)) : ''}
              onChange={(e) => onChange(e.target.value === '' ? null : options[Number(e.target.value)])}
            >
              <option value="">{picker.optional ? '— None —' : 'Choose…'}</option>
              {options.map((o, i) => (
                <option key={i} value={String(i)}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  )
}

/** True when every required choice and picker for the app has a value. */
export function fieldsComplete(app, values) {
  return (
    app.choices.every((c) => hasValue(values[c.key])) &&
    app.pickers.every((p) => p.optional || !visible(p, values) || hasValue(values[p.key]))
  )
}
