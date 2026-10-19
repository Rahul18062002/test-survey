// Thin fetch wrapper. Every error the server sends is already a plain sentence; network failures
// are translated here so nothing technical reaches the screen.

const OFFLINE = "We can't reach QuestionnaireFlow right now. Check your internet connection and try again."

export async function api(path, { method = 'GET', body, form } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: form ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined)
    })
  } catch {
    throw new Error(OFFLINE)
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new Error(OFFLINE)
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'Something went wrong. Please try again.')
    err.status = res.status
    throw err
  }
  return data
}

export const get = (p) => api(p)
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} })
export const put = (p, body) => api(p, { method: 'PUT', body })
export const del = (p) => api(p, { method: 'DELETE' })

// Per-browser conveniences only: who you are for review attribution, and a stable id for item locks.
function store(key, fallback) {
  try {
    let v = localStorage.getItem(key)
    if (v === null && fallback !== undefined) {
      v = typeof fallback === 'function' ? fallback() : fallback
      localStorage.setItem(key, v)
    }
    return v
  } catch {
    return typeof fallback === 'function' ? fallback() : fallback
  }
}

let memoryClientId
export function clientId() {
  memoryClientId ||= store('qf.clientId', () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)))
  return memoryClientId
}

export function getName() {
  return store('qf.name') || ''
}
export function setName(name) {
  try {
    localStorage.setItem('qf.name', name)
  } catch {
    /* stays for this visit only */
  }
}

export const FORMAT_LABEL = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', csv: 'CSV', text: 'pasted text', sheet: 'connected sheet', single: 'question' }

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
