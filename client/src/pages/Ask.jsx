import { useState } from 'react'
import { post } from '../api.js'
import { ErrorNote, Spinner } from '../components/ui.jsx'
import AddAnswer from '../components/AddAnswer.jsx'
import { describeMethod } from './Job.jsx'

export default function Ask() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const ask = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult((await post('/ask', { question })).item)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const it = result
  return (
    <div className="stack-lg narrow">
      <div>
        <h1>Ask a question</h1>
        <p className="muted">Get one answer from your knowledge base — no document needed.</p>
      </div>
      <form className="card stack" onSubmit={ask}>
        <label htmlFor="ask" className="sr-only">Your question</label>
        <textarea id="ask" className="input input-lg" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How long do you keep backups?" autoFocus />
        <div className="row end">
          <button className="btn btn-primary" disabled={busy || !question.trim()}>{busy ? 'Looking…' : 'Find the answer'}</button>
        </div>
      </form>
      {busy && <Spinner label="Looking through your approved answers…" />}
      <ErrorNote>{error}</ErrorNote>
      {it && (
        <section className={`card stack cls-${it.classification}`}>
          {it.classification === 'not_found' ? (
            <>
              <h2>No approved answer yet</h2>
              <p className="muted">Your knowledge base doesn't have an answer for this. Add one, and it'll be answered automatically from now on.</p>
              <div><button className="btn btn-primary" onClick={() => setAdding(true)}>Add an answer</button></div>
            </>
          ) : (
            <>
              <div className="row between">
                <h2>Answer</h2>
                <span className={`pill ${it.classification === 'auto' ? 'pill-ok' : 'pill-warn'}`}>{it.classification === 'auto' ? 'Confident match' : 'Worth double-checking'}</span>
              </div>
              <div className="answer">{it.suggested_answer}</div>
              <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(it.suggested_answer)}>Copy answer</button>
              <details className="details">
                <summary>Details</summary>
                <dl>
                  <dt>How sure we are</dt><dd>{it.confidence}%</dd>
                  <dt>How it was matched</dt><dd>{describeMethod(it.match_method)}</dd>
                  <dt>Matched approved question</dt><dd>{it.matched_question}</dd>
                  {it.source && (<><dt>Source</dt><dd>{it.source}</dd></>)}
                </dl>
              </details>
            </>
          )}
        </section>
      )}
      {adding && <AddAnswer initialQuestion={it?.question || question} onClose={() => setAdding(false)} onSaved={() => setResult(null)} />}
    </div>
  )
}
