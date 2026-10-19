import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, get, post } from '../api.js'
import { useAsync, ErrorNote, Help, AppIcon } from '../components/ui.jsx'
import { AppFields, fieldsComplete } from '../components/viasocket.jsx'

const OUTPUTS = [
  ['same', 'Same as the original'],
  ['pdf', 'PDF'],
  ['docx', 'Word (.docx)'],
  ['xlsx', 'Excel (.xlsx)'],
  ['csv', 'CSV']
]

export default function NewQuestionnaire() {
  const nav = useNavigate()
  const [tab, setTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [output, setOutput] = useState('same')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef(null)
  const integrations = useAsync(() => get('/integrations'), [])
  const sheetApps = (integrations.data?.apps || []).filter((a) => a.category === 'source' && a.connected)
  const [sheetApp, setSheetApp] = useState(null)
  const [sheetValues, setSheetValues] = useState({})

  const pick = (f) => {
    setError(null)
    if (!f) return
    if (!/\.(pdf|docx|xlsx|csv)$/i.test(f.name)) return setError('Please choose a PDF, Word (.docx), Excel (.xlsx) or CSV file.')
    if (f.size > 25 * 1024 * 1024) return setError('That file is larger than 25 MB. Try splitting it, or paste the questions instead.')
    setFile(f)
  }

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      let r
      if (tab === 'upload') {
        const form = new FormData()
        form.append('file', file)
        form.append('outputFormat', output)
        if (title) form.append('title', title)
        r = await api('/jobs', { method: 'POST', form })
      } else if (tab === 'paste') {
        r = await post('/jobs', { mode: 'paste', text, title, outputFormat: output === 'same' ? 'docx' : output })
      } else {
        r = await post('/jobs', { mode: 'sheet', app: sheetApp.key, config: sheetValues, title, outputFormat: output === 'same' ? 'xlsx' : output })
      }
      nav(`/jobs/${r.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const canStart = tab === 'upload' ? Boolean(file) : tab === 'paste' ? text.trim().length > 0 : sheetApp && fieldsComplete(sheetApp, sheetValues)

  return (
    <div className="stack-lg narrow">
      <div>
        <h1>New questionnaire</h1>
        <p className="muted">
          We'll find the questions and fill in answers from your knowledge base. Your file is never changed — you get a new, completed copy.
          {' '}Only have one question? <Link to="/ask">Ask it directly</Link>.
        </p>
      </div>
      <div className="tabs" role="tablist">
        {[['upload', 'Upload a file'], ['paste', 'Paste questions'], ['sheet', 'From a connected sheet']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <section className="card stack">
        {tab === 'upload' && (
          <div
            className={`drop ${drag ? 'drop-on' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          >
            <input ref={input} type="file" accept=".pdf,.docx,.xlsx,.csv" hidden onChange={(e) => pick(e.target.files[0])} />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span className="muted small">{(file.size / 1024).toFixed(0)} KB · click to choose a different file</span>
              </>
            ) : (
              <>
                <strong>Drop a file here, or click to choose</strong>
                <span className="muted small">PDF, Word (.docx), Excel (.xlsx) or CSV — scanned PDFs work too</span>
              </>
            )}
          </div>
        )}
        {tab === 'paste' && (
          <div className="field">
            <label htmlFor="paste">Questions</label>
            <div className="hint">One per line. Keep any numbering — we'll carry it through to the answers.</div>
            <textarea id="paste" className="input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. Do you encrypt data at rest?\n2. Describe your backup process.\n3. Where is customer data stored?'} />
          </div>
        )}
        {tab === 'sheet' && (
          <div className="stack">
            {!sheetApps.length ? (
              <p className="muted">
                Connect Google Sheets or Excel in <Link to="/settings">Settings</Link> to answer questions that live in a sheet. We only read it.
              </p>
            ) : (
              <>
                <div className="row gap wrap">
                  {sheetApps.map((a) => (
                    <button key={a.key} className={`btn ${sheetApp?.key === a.key ? 'btn-selected' : ''}`} onClick={() => { setSheetApp(a); setSheetValues({}) }}>
                      <AppIcon name={a.name} src={a.icon} /> {a.name}
                    </button>
                  ))}
                </div>
                {sheetApp && <AppFields app={sheetApp} values={sheetValues} onChange={setSheetValues} />}
              </>
            )}
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label htmlFor="title">Name (optional)</label>
            <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tab === 'upload' && file ? file.name.replace(/\.[^.]+$/, '') : 'e.g. Acme vendor review'} />
          </div>
          <div className="field">
            <label htmlFor="out">
              Completed file as <Help>You can pick a different format later, when you download.</Help>
            </label>
            <select id="out" className="input" value={output} onChange={(e) => setOutput(e.target.value)}>
              {OUTPUTS.filter(([k]) => tab === 'upload' || k !== 'same').map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="row end">
          <button className="btn btn-primary" disabled={!canStart || busy} onClick={start}>
            {busy ? 'Starting…' : 'Find answers'}
          </button>
        </div>
      </section>
    </div>
  )
}
