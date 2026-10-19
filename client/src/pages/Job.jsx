import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { get, post, put, del, clientId, getName, FORMAT_LABEL } from '../api.js'
import { Spinner, ErrorNote, useToast, useConfirm, Help } from '../components/ui.jsx'
import { StatusPill } from './Questionnaires.jsx'

const BUSY = ['reading', 'matching']
const who = () => ({ clientId: clientId(), name: getName() || undefined })

export const METHOD_LABEL = {
  exact: 'Same wording as an approved answer',
  similar: 'Very similar wording to an approved answer',
  ai: 'Judged a match by AI, comparing it with your approved answers',
  'ai-none': 'AI found no approved answer that fits this question',
  none: 'There were no approved answers to compare against'
}

export function describeMethod(m = 'none') {
  return METHOD_LABEL[m.replace('+stale', '')] || METHOD_LABEL.none
}

export default function Job() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('needs')

  const load = useCallback(async () => {
    try {
      setJob(await get(`/jobs/${id}`))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Background work shows plain progress; poll while it runs, and gently afterwards so locks stay fresh.
  useEffect(() => {
    if (!job) return
    const t = setTimeout(load, BUSY.includes(job.status) ? 1200 : 15000)
    return () => clearTimeout(t)
  }, [job, load])

  if (error && !job) return <ErrorNote>{error}</ErrorNote>
  if (!job) return <Spinner label="Loading…" />

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this questionnaire?', message: 'Its answers and review progress will be deleted. Your knowledge base is not affected.', ok: 'Delete', danger: true }))) return
    await del(`/jobs/${id}`)
    toast('Questionnaire deleted.')
    nav('/questionnaires')
  }

  return (
    <div className="stack-lg">
      <div className="row between wrap gap">
        <div>
          <Link to="/questionnaires" className="small">← Questionnaires</Link>
          <h1>{job.title}</h1>
          <div className="row gap small muted wrap">
            <StatusPill status={job.status} />
            {job.original_filename && <span>From {job.original_filename}</span>}
            {job.detection?.summary && job.status !== 'reading' && <span>· {job.detection.summary}</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={remove}>Delete</button>
      </div>

      {BUSY.includes(job.status) && (
        <section className="card center">
          <Spinner label={job.status_message} />
          <p className="muted small">You can leave this page — we'll keep working, and it'll be here when you come back.</p>
        </section>
      )}

      {job.status === 'failed' && (
        <section className="card">
          <div className="note note-error">{job.status_message}</div>
          <div className="row gap">
            <Link className="btn" to="/new">Try again</Link>
          </div>
        </section>
      )}

      {job.status === 'confirm' && <ConfirmQuestions job={job} onDone={load} />}

      {['review', 'ready', 'completed'].includes(job.status) && <Review job={job} reload={load} filter={filter} setFilter={setFilter} />}
    </div>
  )
}

// ---------- low-confidence detection: a plain preview to add, remove or merge ----------

function ConfirmQuestions({ job, onDone }) {
  const toast = useToast()
  const [rows, setRows] = useState(() => job.items.map((i) => ({ id: i.id, identifier: i.identifier || '', question: i.question })))
  const [busy, setBusy] = useState(false)
  const update = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const merge = (i) =>
    setRows((r) => [...r.slice(0, i), { ...r[i], question: `${r[i].question} ${r[i + 1].question}` }, ...r.slice(i + 2)])
  const submit = async () => {
    setBusy(true)
    try {
      await post(`/jobs/${job.id}/confirm`, { items: rows })
      onDone()
    } catch (err) {
      toast(err.message, 'error')
      setBusy(false)
    }
  }
  return (
    <section className="card stack">
      <div>
        <h2>{job.status_message}</h2>
        <p className="muted">
          This document was a little unusual, so please glance over the list. Remove anything that isn't a question, join lines that belong together, or add one we missed.
        </p>
      </div>
      <ol className="confirm-list">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="confirm-row">
            <input className="input input-id" value={r.identifier} onChange={(e) => update(i, { identifier: e.target.value })} placeholder="#" aria-label="Number" />
            <textarea className="input grow" rows={Math.min(4, Math.ceil(r.question.length / 90) || 1)} value={r.question} onChange={(e) => update(i, { question: e.target.value })} aria-label="Question" />
            <div className="confirm-actions">
              {i < rows.length - 1 && <button className="link small" onClick={() => merge(i)} title="Join with the next line">Join with next</button>}
              <button className="link small danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row between wrap gap">
        <button className="btn" onClick={() => setRows((r) => [...r, { identifier: '', question: '' }])}>+ Add a question</button>
        <button className="btn btn-primary" disabled={busy || !rows.some((r) => r.question.trim())} onClick={submit}>
          {busy ? 'Starting…' : `Looks right — find answers for ${rows.filter((r) => r.question.trim()).length}`}
        </button>
      </div>
    </section>
  )
}

// ---------- review ----------

function Review({ job, reload, filter, setFilter }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [format, setFormat] = useState(job.output_format)
  const [finishing, setFinishing] = useState(false)
  const c = job.counts
  const needs = job.items.filter((i) => i.review_status === 'pending')
  const auto = job.items.filter((i) => i.reviewed_by === 'auto')
  const shown = filter === 'needs' ? needs : filter === 'auto' ? auto : job.items
  const pct = c.total ? Math.round((100 * c.done) / c.total) : 0

  useEffect(() => {
    if (filter === 'needs' && !needs.length && job.items.length) setFilter('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs.length])

  const finish = async () => {
    if (needs.length && !(await confirm({ title: 'Some questions still need you', message: `${needs.length} question${needs.length === 1 ? ' has' : 's have'} no confirmed answer yet and will be left blank in the file.`, ok: 'Finish anyway' }))) return
    setFinishing(true)
    try {
      const r = await post(`/jobs/${job.id}/finish`, { outputFormat: format })
      window.location.href = r.download
      toast('Your completed file is downloading. The original was not changed.')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setFinishing(false)
    }
  }

  return (
    <>
      <section className="card stack">
        <div className="row between wrap gap">
          <div className="grow">
            <div className="row between small">
              <strong>{c.done} of {c.total} answered</strong>
              <span className="muted">{c.auto} filled automatically · {c.review} suggested · {c.not_found} not found</span>
            </div>
            <div className="progress" aria-label={`${pct}% done`}><span style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
        <div className="row between wrap gap">
          <div className="row gap wrap">
            <label htmlFor="fmt" className="small">Download as</label>
            <select id="fmt" className="input input-sm" value={format} onChange={(e) => { setFormat(e.target.value); put(`/jobs/${job.id}`, { outputFormat: e.target.value }).catch(() => {}) }}>
              {['pdf', 'docx', 'xlsx', 'csv'].map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}{f === job.input_format ? ' (same as original)' : ''}
                </option>
              ))}
            </select>
            <Help>Any questionnaire can be downloaded in any format. Spreadsheets keep your original layout with the answers filled in; your original file is never changed.</Help>
          </div>
          <div className="row gap">
            {job.status === 'completed' && <a className="btn" href={`/api/jobs/${job.id}/download?format=${format}`}>Download again</a>}
            <button className="btn btn-primary" onClick={finish} disabled={finishing}>
              {finishing ? 'Preparing…' : job.status === 'completed' ? 'Finish & download' : needs.length ? 'Finish & download' : 'Download completed file'}
            </button>
          </div>
        </div>
      </section>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={filter === 'needs'} className={filter === 'needs' ? 'on' : ''} onClick={() => setFilter('needs')}>Needs you ({needs.length})</button>
        <button role="tab" aria-selected={filter === 'auto'} className={filter === 'auto' ? 'on' : ''} onClick={() => setFilter('auto')}>Filled automatically ({auto.length})</button>
        <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All ({job.items.length})</button>
      </div>

      {filter === 'needs' && !needs.length ? (
        <div className="card center"><strong>All done here.</strong> <span className="muted">Download your completed file above.</span></div>
      ) : (
        <div className="stack">
          {shown.map((it) => (
            <ReviewCard key={it.id} item={it} reload={reload} />
          ))}
        </div>
      )}
    </>
  )
}

export function ReviewCard({ item, reload }) {
  const toast = useToast()
  const [mode, setMode] = useState('view') // view | fix
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [offer, setOffer] = useState(item.kb_offer === 'offered')
  const lockedByOther = item.lockedByClient && item.lockedByClient !== clientId()
  const done = item.review_status !== 'pending'
  const hasSuggestion = Boolean(item.suggested_answer)

  const act = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await reload()
    } catch (err) {
      toast(err.message, 'error')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const startFix = () =>
    act(async () => {
      await post(`/items/${item.id}/lock`, who())
      setDraft(item.final_answer || item.suggested_answer || '')
      setMode('fix')
    })

  const cancelFix = () =>
    act(async () => {
      setMode('view')
      await post(`/items/${item.id}/unlock`, who())
    })

  const saveFix = () =>
    act(async () => {
      const r = await post(`/items/${item.id}/fix`, { ...who(), answer: draft })
      setMode('view')
      setOffer(r.offerKb)
    })

  const answerKb = (add) =>
    act(async () => {
      const r = await post(`/items/${item.id}/kb`, { add, name: getName() })
      setOffer(false)
      if (add) toast(r.message, r.duplicate ? 'warn' : 'ok')
    })

  return (
    <article className={`review-card ${done ? 'is-done' : ''} cls-${item.classification}`}>
      <div className="review-q">
        {item.identifier && <span className="qid">{item.identifier}</span>}
        <div className="grow">
          {item.section && <div className="muted small">{item.section}</div>}
          <div className="q-text">{item.question}</div>
        </div>
        {done && <span className="pill pill-ok">{item.reviewed_by === 'auto' ? 'Filled automatically' : item.review_status === 'skipped' ? 'Left blank' : 'Answered'}</span>}
      </div>

      {mode === 'fix' ? (
        <div className="stack">
          <textarea className="input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="Answer" placeholder="Write the answer you'd like to give." />
          <div className="row gap end">
            <button className="btn" onClick={cancelFix} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFix} disabled={busy || !draft.trim()}>Save answer</button>
          </div>
        </div>
      ) : (
        <>
          <div className={`answer ${!(item.final_answer || item.suggested_answer) ? 'answer-empty' : ''}`}>
            {done
              ? item.final_answer || 'Left blank.'
              : hasSuggestion
                ? item.suggested_answer
                : "We couldn't find an answer to this in your knowledge base."}
          </div>
          {item.stale && !done && <div className="note note-warn small">This answer hasn't been checked in a while. Make sure it's still right.</div>}
          {lockedByOther ? (
            <div className="muted small">{item.lockedName || 'A teammate'} is working on this one right now.</div>
          ) : !done ? (
            <div className="row gap wrap">
              {hasSuggestion && <button className="btn btn-primary" onClick={() => act(() => post(`/items/${item.id}/approve`, who()))} disabled={busy}>Looks good</button>}
              <button className={`btn ${hasSuggestion ? '' : 'btn-primary'}`} onClick={startFix} disabled={busy}>{hasSuggestion ? 'Fix it' : 'Write an answer'}</button>
              {!hasSuggestion && <button className="link small" onClick={() => act(() => post(`/items/${item.id}/skip`, who()))} disabled={busy}>Leave blank</button>}
            </div>
          ) : (
            <div className="row gap">
              <button className="link small" onClick={() => act(() => post(`/items/${item.id}/reopen`, who()))} disabled={busy}>Change</button>
            </div>
          )}
        </>
      )}

      {offer && mode === 'view' && (
        <div className="kb-offer">
          <span>Add this answer to your knowledge base, so it's filled in automatically next time?</span>
          <div className="row gap">
            <button className="btn btn-sm btn-primary" onClick={() => answerKb(true)} disabled={busy}>Add it</button>
            <button className="btn btn-sm" onClick={() => answerKb(false)} disabled={busy}>Not now</button>
          </div>
        </div>
      )}

      <details className="details">
        <summary>Details</summary>
        <dl>
          <dt>How sure we are</dt>
          <dd>{item.confidence}%</dd>
          <dt>How it was matched</dt>
          <dd>{describeMethod(item.match_method)}</dd>
          {item.matched_question && (<><dt>Matched approved question</dt><dd>{item.matched_question}</dd></>)}
          {item.source && (<><dt>Source</dt><dd>{item.source}</dd></>)}
          {item.lastVerified && (<><dt>Last checked</dt><dd>{new Date(item.lastVerified).toLocaleDateString('en-US', { dateStyle: 'medium' })}</dd></>)}
          {item.reviewed_by && item.reviewed_by !== 'auto' && (<><dt>Reviewed by</dt><dd>{item.reviewed_by}</dd></>)}
        </dl>
      </details>
    </article>
  )
}
