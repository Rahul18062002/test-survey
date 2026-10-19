import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, get, post, put, del, timeAgo } from '../api.js'
import { useAsync, Spinner, ErrorNote, Empty, Modal, useToast, useConfirm, Help, AppIcon } from '../components/ui.jsx'
import { AppFields, fieldsComplete } from '../components/viasocket.jsx'
import AddAnswer from '../components/AddAnswer.jsx'

export default function Knowledge() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'answers'
  const dupes = useAsync(() => get('/kb/duplicates'), [tab])
  const setTab = (t) => setParams(t === 'answers' ? {} : { tab: t })
  return (
    <div className="stack-lg">
      <div>
        <h1>Knowledge base</h1>
        <p className="muted">Your approved answers — the only place answers come from. Sheets and imports feed it; nothing here changes your sheets.</p>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'answers'} className={tab === 'answers' ? 'on' : ''} onClick={() => setTab('answers')}>Answers</button>
        <button role="tab" aria-selected={tab === 'sources'} className={tab === 'sources' ? 'on' : ''} onClick={() => setTab('sources')}>Connected sheets</button>
        <button role="tab" aria-selected={tab === 'duplicates'} className={tab === 'duplicates' ? 'on' : ''} onClick={() => setTab('duplicates')}>
          Possible duplicates{dupes.data?.duplicates.length ? ` (${dupes.data.duplicates.length})` : ''}
        </button>
      </div>
      {tab === 'answers' && <Answers onChange={dupes.reload} />}
      {tab === 'sources' && <Sources />}
      {tab === 'duplicates' && <Duplicates state={dupes} />}
    </div>
  )
}

function Answers({ onChange }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const list = useAsync(() => get(`/kb?search=${encodeURIComponent(search)}&filter=${filter}`), [search, filter])
  const settings = useAsync(() => get('/settings'), [])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)
  const reload = () => {
    list.reload()
    onChange()
  }

  const remove = async (e) => {
    if (!(await confirm({ title: 'Remove this answer?', message: `“${e.question}” will no longer be used to answer questionnaires.`, ok: 'Remove', danger: true }))) return
    const r = await del(`/kb/${e.id}`)
    toast(r.message)
    reload()
  }
  const verify = async (e) => {
    const r = await post(`/kb/${e.id}/verify`)
    toast(r.message)
    reload()
  }
  const loadSample = async () => {
    try {
      toast((await post('/kb/sample')).message)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const entries = list.data?.entries || []
  return (
    <div className="stack">
      <div className="row between wrap gap">
        <div className="row gap wrap">
          <input className="input" placeholder="Search answers…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search answers" />
          {settings.data?.stalenessEnabled && (
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
              <option value="">All answers</option>
              <option value="stale">Needs a re-check</option>
            </select>
          )}
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => setImporting(true)}>Import a file</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>Add an answer</button>
        </div>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {list.loading ? (
        <Spinner label="Loading…" />
      ) : !entries.length ? (
        search || filter ? (
          <p className="muted">No answers match.</p>
        ) : (
          <Empty title="No answers yet" action={<div className="row gap center-x"><Link className="btn" to="?tab=sources">Connect a sheet</Link><button className="btn" onClick={() => setImporting(true)}>Import a file</button><button className="btn btn-primary" onClick={() => setAdding(true)}>Add an answer</button></div>}>
            Add the answers your organization has already approved. <button className="link" onClick={loadSample}>Or load a few samples</button> to try things out.
          </Empty>
        )
      ) : (
        <div className="stack-sm">
          <div className="muted small">{entries.length} answer{entries.length === 1 ? '' : 's'}</div>
          {entries.map((e) => (
            <article key={e.id} className="kb-entry">
              <div className="row between gap">
                <strong className="grow">{e.question}</strong>
                <div className="row gap nowrap">
                  {e.stale && <span className="pill pill-warn">Needs a re-check</span>}
                  {e.open_duplicates > 0 && <Link className="pill pill-warn" to="?tab=duplicates">Possible duplicate</Link>}
                </div>
              </div>
              <div className="kb-answer">{e.answer}</div>
              <div className="row between wrap gap small">
                <span className="muted">{e.source_label} · checked {timeAgo(e.last_verified)}</span>
                <span className="row gap">
                  <button className="link" onClick={() => setEditing(e)}>Edit</button>
                  {e.stale && <button className="link" onClick={() => verify(e)}>Still correct</button>}
                  <button className="link danger" onClick={() => remove(e)}>Remove</button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      {adding && <AddAnswer onClose={() => setAdding(false)} onSaved={reload} />}
      {editing && <EditAnswer entry={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {importing && <ImportFile onClose={() => setImporting(false)} onDone={reload} />}
    </div>
  )
}

function EditAnswer({ entry, onClose, onSaved }) {
  const toast = useToast()
  const [q, setQ] = useState(entry.question)
  const [a, setA] = useState(entry.answer)
  const [error, setError] = useState(null)
  const save = async (e) => {
    e.preventDefault()
    try {
      toast((await put(`/kb/${entry.id}`, { question: q, answer: a })).message)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal title="Edit answer" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="field"><label htmlFor="eq">Question</label><textarea id="eq" className="input" rows={2} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field"><label htmlFor="ea">Approved answer</label><textarea id="ea" className="input" rows={6} value={a} onChange={(e) => setA(e.target.value)} /></div>
        {entry.source_type === 'sheet' && <div className="note small">This answer comes from a connected sheet. The next sync will bring back what the sheet says, so it's best to change it there.</div>}
        <ErrorNote>{error}</ErrorNote>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></div>
      </form>
    </Modal>
  )
}

function ImportFile({ onClose, onDone }) {
  const toast = useToast()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [cols, setCols] = useState(null)

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api('/kb/import', { method: 'POST', form })
      if (r.done) {
        toast(r.message, r.duplicates ? 'warn' : 'ok')
        onDone()
        onClose()
      } else {
        setPreview(r)
        setCols({ q: r.preview.q, a: r.preview.a, headerRow: r.preview.headerRow })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const commit = async () => {
    setBusy(true)
    try {
      const r = await post(`/kb/import/${preview.token}`, cols)
      toast(r.message, r.duplicates ? 'warn' : 'ok')
      onDone()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Import answers from a file" onClose={onClose} wide={Boolean(preview)}>
      {!preview ? (
        <div className="stack">
          <p className="muted">A CSV or Excel file with a column of questions and a column of answers. We'll find the columns ourselves.</p>
          <div className="drop" role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
            <input ref={input} type="file" hidden accept=".csv,.xlsx" onChange={(e) => upload(e.target.files[0])} />
            {busy ? <Spinner label="Reading…" /> : <strong>Choose a CSV or Excel file</strong>}
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : (
        <div className="stack">
          <p>
            We think we found <strong>{preview.preview.count}</strong> answers — <span className="muted">{preview.preview.summary.toLowerCase()}</span>. Does this look right?
          </p>
          <table className="table small">
            <thead><tr><th>Question</th><th>Answer</th></tr></thead>
            <tbody>{preview.preview.sample.map((s, i) => <tr key={i}><td>{s.question}</td><td>{s.answer}</td></tr>)}</tbody>
          </table>
          <details>
            <summary className="small">Not quite? Choose the columns</summary>
            <div className="grid-2">
              {[['q', 'Questions are in'], ['a', 'Answers are in']].map(([k, label]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <select className="input" value={cols[k]} onChange={(e) => setCols({ ...cols, [k]: Number(e.target.value) })}>
                    {preview.preview.columns.map((c) => <option key={c.index} value={c.index}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </details>
          <ErrorNote>{error}</ErrorNote>
          <div className="row end gap">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={commit} disabled={busy}>Yes, import them</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Sources() {
  const toast = useToast()
  const confirm = useConfirm()
  const sources = useAsync(() => get('/kb/sources'), [])
  const integrations = useAsync(() => get('/integrations'), [])
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(null)
  const apps = (integrations.data?.apps || []).filter((a) => a.category === 'source')

  const sync = async (s) => {
    setSyncing(s.id)
    try {
      toast((await post(`/kb/sources/${s.id}/sync`)).message)
      sources.reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSyncing(null)
    }
  }
  const remove = async (s) => {
    const keep = await confirm({
      title: 'Stop syncing this sheet?',
      message: 'Keep the answers that came from it in your knowledge base? (Your sheet itself is never touched.)',
      ok: 'Keep the answers',
      cancel: 'Remove them too'
    })
    const r = await del(`/kb/sources/${s.id}?keepAnswers=${keep ? 1 : 0}`)
    toast(r.message)
    sources.reload()
  }

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <p className="muted grow">
          Connected sheets are read, never changed. Sync whenever your sheet changes. <Help>We read the whole sheet, find the question and answer columns, then add new answers, update changed ones and retire rows that were deleted.</Help>
        </p>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Connect a sheet</button>
      </div>
      {sources.loading ? <Spinner /> : !sources.data?.sources.length ? (
        <Empty title="No connected sheets">Keep answers in a Google Sheet or Excel file your team already maintains.</Empty>
      ) : (
        sources.data.sources.map((s) => (
          <article key={s.id} className="card row between wrap gap">
            <div className="row gap grow">
              <AppIcon name={s.appName} src={s.icon} size={28} />
              <div>
                <strong>{s.label}</strong>
                <div className="muted small">{s.appName} · {s.last_status || 'Not synced yet'} · {s.last_synced_at ? `synced ${timeAgo(s.last_synced_at)}` : ''}</div>
              </div>
            </div>
            <div className="row gap">
              <button className="btn btn-sm" onClick={() => sync(s)} disabled={syncing === s.id}>{syncing === s.id ? 'Syncing…' : 'Sync now'}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(s)}>Remove</button>
            </div>
          </article>
        ))
      )}
      {adding && <AddSource apps={apps} onClose={() => setAdding(false)} onDone={sources.reload} />}
    </div>
  )
}

function AddSource({ apps, onClose, onDone }) {
  const toast = useToast()
  const [app, setApp] = useState(null)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      toast((await post('/kb/sources', { app: app.key, config: values })).message)
      onDone()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Connect a sheet" onClose={onClose}>
      <div className="stack">
        <div className="row gap wrap">
          {apps.map((a) => (
            <button key={a.key} className={`btn ${app?.key === a.key ? 'btn-selected' : ''}`} onClick={() => { setApp(a); setValues({}) }}>
              <AppIcon name={a.name} src={a.icon} /> {a.name}
            </button>
          ))}
        </div>
        {app && !app.connected && (
          <div className="note">
            {app.name} isn't connected yet. <Link to="/settings">Connect it in Settings</Link> — it takes one click — then come back here.
          </div>
        )}
        {app?.connected && <AppFields app={app} values={values} onChange={setValues} />}
        <ErrorNote>{error}</ErrorNote>
        <div className="row end gap">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!app?.connected || !fieldsComplete(app, values) || busy} onClick={save}>{busy ? 'Reading your sheet…' : 'Save and sync'}</button>
        </div>
      </div>
    </Modal>
  )
}

function Duplicates({ state }) {
  const toast = useToast()
  const resolve = async (d, action) => {
    try {
      await post(`/kb/duplicates/${d.id}`, { action })
      toast(action === 'keep_both' ? 'Kept both.' : 'Done — one answer kept.')
      state.reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  if (state.loading) return <Spinner />
  const list = state.data?.duplicates || []
  if (!list.length) return <Empty title="No duplicates to check">When a new answer looks a lot like one you already have, it shows up here.</Empty>
  return (
    <div className="stack">
      {list.map((d) => (
        <article key={d.id} className="card stack">
          <div className="muted small">These look very similar ({d.similarity}% alike). Which should we keep?</div>
          <div className="grid-2">
            {[['new', 'Newer'], ['old', 'Already had']].map(([k, label]) => (
              <div key={k} className="dup">
                <div className="muted small">{label} · {d[`${k}_source`]}</div>
                <strong>{d[`${k}_question`]}</strong>
                <p>{d[`${k}_answer`]}</p>
              </div>
            ))}
          </div>
          <div className="row gap wrap">
            <button className="btn btn-sm" onClick={() => resolve(d, 'keep_new')}>Keep the newer one</button>
            <button className="btn btn-sm" onClick={() => resolve(d, 'keep_existing')}>Keep the one I had</button>
            <button className="btn btn-sm btn-ghost" onClick={() => resolve(d, 'keep_both')}>They're different — keep both</button>
          </div>
        </article>
      ))}
    </div>
  )
}
