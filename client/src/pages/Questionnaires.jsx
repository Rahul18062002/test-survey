import { Link } from 'react-router-dom'
import { get, timeAgo, FORMAT_LABEL } from '../api.js'
import { useAsync, Spinner, Empty, ErrorNote } from '../components/ui.jsx'

const STATUS = {
  reading: ['Reading', 'pill-busy'],
  confirm: ['Check the questions', 'pill-warn'],
  matching: ['Finding answers', 'pill-busy'],
  review: ['Needs review', 'pill-warn'],
  ready: ['Ready to download', 'pill-ok'],
  completed: ['Finished', 'pill-ok'],
  failed: ["Couldn't finish", 'pill-error']
}

export function StatusPill({ status }) {
  const [label, cls] = STATUS[status] || [status, '']
  return <span className={`pill ${cls}`}>{label}</span>
}

export default function Questionnaires() {
  const { data, loading, error } = useAsync(() => get('/jobs'), [])
  if (loading) return <Spinner label="Loading…" />
  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <h1>Questionnaires</h1>
        <Link className="btn btn-primary" to="/new">New questionnaire</Link>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data?.jobs.length ? (
        <Empty title="No questionnaires yet" action={<Link className="btn btn-primary" to="/new">Upload one</Link>}>
          Upload a PDF, Word or Excel file, or paste questions, and we'll fill in what we can.
        </Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>From</th>
                <th>Questions</th>
                <th>Status</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link to={`/jobs/${j.id}`}>{j.title}</Link></td>
                  <td className="muted">{FORMAT_LABEL[j.input_format] || j.input_format}</td>
                  <td>{j.total}{j.pending ? <span className="muted small"> · {j.pending} to check</span> : null}</td>
                  <td><StatusPill status={j.status} /></td>
                  <td className="muted">{timeAgo(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
