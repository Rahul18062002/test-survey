import { useEffect, useState } from 'react'
import { get, post, put, del, timeAgo } from '../api.js'
import { useAsync, Spinner, ErrorNote, Modal, useToast, useConfirm, Help, AppIcon } from '../components/ui.jsx'
import { useConnect, AppFields, fieldsComplete } from '../components/viasocket.jsx'

const GROUPS = [
  ['source', 'Where your answers live', 'Read-only. We never change your sheets.'],
  ['email', 'Email', 'Send updates by email from your own account.'],
  ['messaging', 'Team chat', 'Post updates to a channel.']
]

export default function Settings() {
  const integrations = useAsync(() => get('/integrations'), [])
  return (
    <div className="stack-lg">
      <div>
        <h1>Settings</h1>
        <p className="muted">These apply to everyone in your organization.</p>
      </div>
      <ConnectedApps state={integrations} />
      <Notifications integrations={integrations} />
      <Matching />
      <Activity />
    </div>
  )
}

function ConnectedApps({ state }) {
  const toast = useToast()
  const confirm = useConfirm()
  const apps = state.data?.apps || []
  const { connect, busy } = useConnect(apps, state.reload)

  const disconnect = async (app) => {
    if (!(await confirm({ title: `Disconnect ${app.name}?`, message: `QuestionnaireFlow will stop using your ${app.name} account. Notifications or sheets that use it will pause until you connect again.`, ok: 'Disconnect', danger: true }))) return
    try {
      toast((await del(`/integrations/${app.key}`)).message)
      state.reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <section className="card stack">
      <div>
        <h2>Connected apps</h2>
        <p className="muted small">Connect once for your whole organization. You sign in on the app's own page — QuestionnaireFlow never sees or stores your password.</p>
      </div>
      {state.loading ? <Spinner /> : state.data && !state.data.configured ? (
        <div className="note">App connections aren't switched on for this installation yet. Ask whoever set up QuestionnaireFlow to finish the setup.</div>
      ) : (
        <>
          <ErrorNote>{state.error}</ErrorNote>
          {GROUPS.map(([cat, title, sub]) => (
            <div key={cat} className="stack-sm">
              <div>
                <strong>{title}</strong> <span className="muted small">— {sub}</span>
              </div>
              <div className="app-grid">
                {apps.filter((a) => a.category === cat).map((a) => (
                  <div key={a.key} className={`app-card ${a.connected ? 'is-on' : ''}`}>
                    <div className="row gap">
                      <AppIcon name={a.name} src={a.icon} size={32} />
                      <div className="grow">
                        <strong>{a.name}</strong>
                        <div className="muted small">
                          {a.needsReconnect ? 'Needs you to sign in again' : a.connected ? `Connected ${timeAgo(a.connectedAt)}` : a.blurb}
                        </div>
                      </div>
                    </div>
                    <div className="row gap">
                      {busy === a.key ? (
                        <Spinner label="Finishing…" />
                      ) : a.needsReconnect ? (
                        <button className="btn btn-sm btn-primary" onClick={() => connect(a, { reconnect: true })}>
                          <AppIcon name={a.name} src={a.icon} size={16} /> Reconnect {a.name}
                        </button>
                      ) : a.connected ? (
                        <>
                          <span className="pill pill-ok">Connected</span>
                          <button className="link small" onClick={() => disconnect(a)}>Disconnect</button>
                        </>
                      ) : (
                        <button className="btn btn-sm" onClick={() => connect(a)}>
                          <AppIcon name={a.name} src={a.icon} size={16} /> Connect {a.name}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function Notifications({ integrations }) {
  const toast = useToast()
  const confirm = useConfirm()
  const dests = useAsync(() => get('/destinations'), [])
  const [adding, setAdding] = useState(false)
  const events = integrations.data?.events || {}
  const senders = (integrations.data?.apps || []).filter((a) => a.category !== 'source')

  const toggleEvent = async (d, ev) => {
    const next = d.events.includes(ev) ? d.events.filter((e) => e !== ev) : [...d.events, ev]
    try {
      await put(`/destinations/${d.id}`, { events: next })
      dests.reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const test = async (d) => {
    try {
      toast((await post(`/destinations/${d.id}/test`)).message)
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  const remove = async (d) => {
    if (!(await confirm({ title: 'Stop sending here?', message: `Updates will no longer go to ${d.label}.`, ok: 'Remove', danger: true }))) return
    await del(`/destinations/${d.id}`)
    dests.reload()
  }

  return (
    <section className="card stack">
      <div className="row between wrap gap">
        <div>
          <h2>Notifications</h2>
          <p className="muted small">Choose where updates go and which ones. They're sent automatically when something happens.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)} disabled={!senders.some((a) => a.connected)} title={senders.some((a) => a.connected) ? '' : 'Connect an email or chat app first'}>
          Add a destination
        </button>
      </div>
      {!senders.some((a) => a.connected) && <p className="muted small">Connect Gmail, Outlook, Slack or Microsoft Teams above to send updates.</p>}
      {dests.loading ? <Spinner /> : (
        (dests.data?.destinations || []).map((d) => (
          <div key={d.id} className="dest">
            <div className="row between wrap gap">
              <div className="row gap">
                <AppIcon name={d.appName} src={d.icon} />
                <div>
                  <strong>{d.label}</strong>
                  <div className="muted small">{d.appName}{!d.enabled ? ' · paused — connect the app again to resume' : ''}</div>
                </div>
              </div>
              <div className="row gap">
                <button className="btn btn-sm" onClick={() => test(d)} disabled={!d.enabled}>Send a test</button>
                <button className="link small danger" onClick={() => remove(d)}>Remove</button>
              </div>
            </div>
            <div className="row gap wrap">
              {Object.entries(events).map(([ev, label]) => (
                <label key={ev} className="check small">
                  <input type="checkbox" checked={d.events.includes(ev)} onChange={() => toggleEvent(d, ev)} /> {label}
                </label>
              ))}
            </div>
          </div>
        ))
      )}
      {adding && <AddDestination apps={senders.filter((a) => a.connected)} events={events} onClose={() => setAdding(false)} onDone={dests.reload} />}
    </section>
  )
}

function AddDestination({ apps, events, onClose, onDone }) {
  const toast = useToast()
  const [app, setApp] = useState(apps.length === 1 ? apps[0] : null)
  const [values, setValues] = useState({})
  const [to, setTo] = useState('')
  const [chosen, setChosen] = useState(Object.keys(events))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isEmail = app?.category === 'email'
  const complete = app && fieldsComplete(app, values) && (!isEmail || to.trim()) && chosen.length

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/destinations', { app: app.key, config: { ...values, ...(isEmail ? { to } : {}) }, events: chosen })
      toast('Saved. Updates will be sent there automatically.')
      onDone()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Add a destination" onClose={onClose}>
      <div className="stack">
        <div className="row gap wrap">
          {apps.map((a) => (
            <button key={a.key} className={`btn ${app?.key === a.key ? 'btn-selected' : ''}`} onClick={() => { setApp(a); setValues({}) }}>
              <AppIcon name={a.name} src={a.icon} /> {a.name}
            </button>
          ))}
        </div>
        {app && (
          <>
            {isEmail && (
              <div className="field">
                <label htmlFor="to">Send to</label>
                <div className="hint">One or more email addresses, separated by commas.</div>
                <input id="to" className="input" type="text" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="security-team@yourcompany.com" />
              </div>
            )}
            <AppFields app={app} values={values} onChange={setValues} />
            <div className="field">
              <label>Send these updates</label>
              {Object.entries(events).map(([ev, label]) => (
                <label key={ev} className="check">
                  <input type="checkbox" checked={chosen.includes(ev)} onChange={() => setChosen(chosen.includes(ev) ? chosen.filter((x) => x !== ev) : [...chosen, ev])} /> {label}
                </label>
              ))}
            </div>
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="row end gap">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!complete || busy} onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

function Matching() {
  const toast = useToast()
  const { data, loading } = useAsync(() => get('/settings'), [])
  const [s, setS] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (data) setS(data)
  }, [data])
  if (loading || !s) return <section className="card"><Spinner /></section>

  const save = async () => {
    setError(null)
    try {
      toast((await put('/settings', s)).message)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="card stack">
      <h2>How answers are filled</h2>
      <div className="field">
        <label htmlFor="th">
          Fill in automatically when we're at least <strong>{s.autofillThreshold}%</strong> sure
          <Help>Higher means fewer automatic answers and more for people to check. Lower means faster, but check the results. Most teams start around 85%.</Help>
        </label>
        <input id="th" type="range" min={50} max={100} value={s.autofillThreshold} onChange={(e) => setS({ ...s, autofillThreshold: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label htmlFor="fl">
          Below that, suggest an answer for review when we're at least <strong>{s.reviewFloor}%</strong> sure
          <Help>Anything less sure than this is shown as “not found”, so nobody is nudged toward a weak answer.</Help>
        </label>
        <input id="fl" type="range" min={0} max={Math.max(1, s.autofillThreshold - 1)} value={Math.min(s.reviewFloor, s.autofillThreshold - 1)} onChange={(e) => setS({ ...s, reviewFloor: Number(e.target.value) })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={s.aiMatching} onChange={(e) => setS({ ...s, aiMatching: e.target.checked })} />
        Use AI to recognise questions that are worded differently
        <Help>When a question isn't an obvious match, AI compares it with your closest approved answers. It only ever picks from your approved answers — it never writes new ones.</Help>
      </label>
      <div className="divider" />
      <h3>Answer freshness</h3>
      <label className="check">
        <input type="checkbox" checked={s.stalenessEnabled} onChange={(e) => setS({ ...s, stalenessEnabled: e.target.checked })} />
        Flag answers that haven't been checked in
        <input className="input input-xs" type="number" min={7} max={3650} value={s.stalenessDays} onChange={(e) => setS({ ...s, stalenessDays: Number(e.target.value) })} disabled={!s.stalenessEnabled} aria-label="Days" />
        days
        <Help>Flagged answers are always shown to a person before they're used, never filled in automatically.</Help>
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="row end">
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
    </section>
  )
}

function Activity() {
  const { data, loading, reload } = useAsync(() => get('/activity'), [])
  return (
    <section className="card stack">
      <div className="row between">
        <h2>Recent updates sent</h2>
        <button className="link small" onClick={reload}>Refresh</button>
      </div>
      {loading ? <Spinner /> : !data?.activity.length ? (
        <p className="muted small">Nothing yet. When a questionnaire is finished, needs review, or has unanswered questions, it shows here.</p>
      ) : (
        <ul className="list">
          {data.activity.map((a) => (
            <li key={a.id}>
              <div className="row between gap">
                <span>{a.summary}</span>
                <span className="muted small nowrap">{timeAgo(a.created_at)}</span>
              </div>
              <div className="small muted">
                {!a.deliveries.length
                  ? 'No destination is set up for this kind of update.'
                  : a.deliveries.map((d, i) => (
                      <span key={i} className={d.ok ? 'ok-text' : 'error-text'}>
                        {d.ok ? `Sent to ${d.destination}` : `Not sent to ${d.destination}: ${d.message}`}
                        {i < a.deliveries.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
