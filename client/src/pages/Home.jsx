import { useState } from 'react'
import { Link } from 'react-router-dom'
import { get, post, put, timeAgo } from '../api.js'
import { useAsync, Spinner, ErrorNote, useToast, Help } from '../components/ui.jsx'
import AddAnswer from '../components/AddAnswer.jsx'
import { StatusPill } from './Questionnaires.jsx'

export default function Home() {
  const toast = useToast()
  const dash = useAsync(() => get('/dashboard'), [])
  const settings = useAsync(() => get('/settings'), [])
  const [adding, setAdding] = useState(null)

  if (dash.loading) return <Spinner label="Loading…" />
  const d = dash.data
  if (!d) return <ErrorNote>{dash.error}</ErrorNote>
  const sourceConnected = d.connections.includes('google_sheets') || d.connections.includes('excel')
  const steps = [
    { done: d.kbCount > 0, title: 'Add your approved answers', body: 'Connect a Google Sheet or Excel file, import a spreadsheet, or type answers in.', to: '/knowledge', cta: sourceConnected ? 'Open knowledge base' : 'Add answers' },
    { done: d.jobs > 0, title: 'Upload a questionnaire', body: 'PDF, Word or Excel — or paste the questions. We find them for you.', to: '/new', cta: 'Upload' },
    { done: d.jobs > 0 && d.pendingReview === 0 && d.answered > 0, title: 'Review the suggestions', body: 'Two buttons: “Looks good” or “Fix it”.', to: '/questionnaires', cta: 'Review' },
    { done: d.recent.some((r) => r.status === 'completed'), title: 'Download or send', body: 'Get a completed file in any format. Optionally notify Slack, Teams or email.', to: '/questionnaires', cta: 'See questionnaires' }
  ]
  const showGuide = settings.data && !settings.data.onboardingDismissed && !steps.every((s) => s.done)

  const loadSample = async () => {
    try {
      const r = await post('/kb/sample')
      toast(r.message)
      dash.reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div>
          <h1>{d.jobs ? 'Welcome back' : 'Welcome'}</h1>
          <p className="muted">Answer questionnaires from your own approved answers, with a quick human check.</p>
        </div>
        <div className="row gap">
          <Link className="btn" to="/ask">Ask one question</Link>
          <Link className="btn btn-primary" to="/new">New questionnaire</Link>
        </div>
      </div>

      {showGuide && (
        <section className="card guide">
          <div className="row between">
            <h2>Getting started</h2>
            <button className="link small" onClick={async () => { await put('/settings', { onboardingDismissed: true }); settings.reload() }}>Hide this</button>
          </div>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i} className={s.done ? 'done' : ''}>
                <span className="step-num">{s.done ? '✓' : i + 1}</span>
                <div className="grow">
                  <strong>{s.title}</strong>
                  <div className="muted small">{s.body}</div>
                </div>
                {!s.done && <Link className="btn btn-sm" to={s.to}>{s.cta}</Link>}
              </li>
            ))}
          </ol>
          {d.kbCount === 0 && (
            <p className="small muted">
              Just looking around? <button className="link" onClick={loadSample}>Load a few sample answers</button> to try it with any security questionnaire.
            </p>
          )}
        </section>
      )}

      <section className="stats">
        <Stat label="Approved answers" value={d.kbCount} to="/knowledge" />
        <Stat label="Questionnaires" value={d.jobs} to="/questionnaires" />
        <Stat label="Filled automatically" value={d.autoRate === null ? '—' : `${d.autoRate}%`} help="Of all questions answered so far, how many were filled without anyone needing to check them." />
        <Stat label="Waiting for review" value={d.pendingReview} to="/questionnaires" highlight={d.pendingReview > 0} />
      </section>

      {d.duplicates > 0 && (
        <div className="note note-warn">
          {d.duplicates} answer{d.duplicates === 1 ? ' looks' : 's look'} like {d.duplicates === 1 ? 'a duplicate' : 'duplicates'}. <Link to="/knowledge?tab=duplicates">Take a look</Link>
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <div className="row between">
            <h2>Top unanswered questions</h2>
            <Help>Questions your knowledge base couldn't answer, most frequent first. Adding an answer here means it's filled automatically next time.</Help>
          </div>
          {!d.unanswered.length ? (
            <p className="muted">Nothing yet. Questions we can't answer will show up here so you know what to add.</p>
          ) : (
            <ul className="list">
              {d.unanswered.map((u) => (
                <li key={u.normalized} className="row between gap">
                  <div className="grow">
                    <div>{u.question}</div>
                    <div className="muted small">Asked {u.times} time{u.times === 1 ? '' : 's'} · last {timeAgo(u.last_seen)}</div>
                  </div>
                  {u.nowAnswered ? <span className="pill pill-ok">Answered now</span> : <button className="btn btn-sm" onClick={() => setAdding(u.question)}>Add answer</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="row between">
            <h2>Recent questionnaires</h2>
            <Link to="/questionnaires" className="small">See all</Link>
          </div>
          {!d.recent.length ? (
            <p className="muted">None yet. <Link to="/new">Upload your first one</Link>.</p>
          ) : (
            <ul className="list">
              {d.recent.map((r) => (
                <li key={r.id} className="row between gap">
                  <Link to={`/jobs/${r.id}`} className="grow">{r.title}</Link>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {adding !== null && <AddAnswer initialQuestion={adding} onClose={() => setAdding(null)} onSaved={dash.reload} />}
    </div>
  )
}

function Stat({ label, value, to, help, highlight }) {
  const body = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label} {help && <Help>{help}</Help>}
      </div>
    </>
  )
  return to ? <Link to={to} className={`stat ${highlight ? 'stat-hl' : ''}`}>{body}</Link> : <div className="stat">{body}</div>
}
