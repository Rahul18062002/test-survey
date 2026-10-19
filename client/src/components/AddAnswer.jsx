import { useState } from 'react'
import { post, getName } from '../api.js'
import { Modal, useToast, ErrorNote } from './ui.jsx'

/** Add one approved question/answer pair by hand — no document needed. */
export default function AddAnswer({ initialQuestion = '', onClose, onSaved }) {
  const toast = useToast()
  const [question, setQuestion] = useState(initialQuestion)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await post('/kb', { question, answer, name: getName() })
      toast(r.message, r.duplicate ? 'warn' : 'ok')
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title="Add an answer" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <div className="field">
          <label htmlFor="add-q">Question</label>
          <textarea id="add-q" className="input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Do you encrypt data at rest?" required />
        </div>
        <div className="field">
          <label htmlFor="add-a">Approved answer</label>
          <textarea id="add-a" className="input" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="The answer your organization is happy to give, word for word." required />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="row end gap">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save answer'}</button>
        </div>
      </form>
    </Modal>
  )
}
