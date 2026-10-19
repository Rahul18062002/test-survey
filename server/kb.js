// The knowledge base: the product's own table of approved answers, and the single source of truth.
// Connected sheets and uploads feed it; nothing here ever writes back to a sheet or an uploaded file.
import fs from 'node:fs'
import { all, get, run, now, transaction, getSetting } from './db.js'
import { normalize, clean } from './extract/heuristics.js'
import { detectKbColumns, columnLetter } from './extract/table.js'
import { readXlsx } from './extract/index.js'
import { buildIndex, candidates } from './match.js'
import { PlainError, MESSAGES } from './plain.js'
import Papa from 'papaparse'

const DUPLICATE_AT = 82

function dateLabel(iso = now()) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export const sourceLabels = {
  manual: (by) => `Manually added by ${by || 'a teammate'} on ${dateLabel()}`,
  review: (by) => `Approved from review${by ? ` by ${by}` : ''} on ${dateLabel()}`,
  import: (file) => `Imported from ${file} on ${dateLabel()}`,
  sample: () => 'Sample answer (replace with your own)'
}

/** Insert one approved answer and flag a likely duplicate for review instead of silently merging. */
export function addEntry({ question, answer, sourceType, sourceLabel, sourceRef = null, sourceId = null, confidence = 100 }, index) {
  question = clean(question)
  answer = String(answer ?? '').trim()
  if (!question || !answer) throw new PlainError('Both a question and an answer are needed.')
  const ts = now()
  const normalized = normalize(question)
  const idx = index || buildIndex(all('SELECT * FROM kb_entries WHERE archived = 0'))
  const best = idx.docs.length ? candidates(idx, question, 1)[0] : null
  const info = run(
    `INSERT INTO kb_entries (question, answer, normalized, source_type, source_label, source_ref, source_id, confidence, last_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    question, answer, normalized, sourceType, sourceLabel, sourceRef, sourceId, confidence, ts, ts, ts
  )
  const id = Number(info.lastInsertRowid)
  let duplicate = null
  if (best && best.score >= DUPLICATE_AT) {
    run('INSERT INTO kb_duplicates (entry_id, existing_id, similarity, created_at) VALUES (?, ?, ?, ?)', id, best.entry.id, best.score, ts)
    duplicate = { id: best.entry.id, question: best.entry.question, similarity: best.score }
  }
  return { id, duplicate }
}

export function listEntries({ search = '', filter = '' } = {}) {
  const staleDays = Number(getSetting('staleness_days')) || 90
  const staleOn = getSetting('staleness_enabled') === '1'
  let rows = all(
    `SELECT e.*, (SELECT COUNT(*) FROM kb_duplicates d WHERE d.status = 'open' AND (d.entry_id = e.id OR d.existing_id = e.id)) AS open_duplicates
     FROM kb_entries e WHERE e.archived = 0 ORDER BY e.updated_at DESC`
  )
  const cutoff = Date.now() - staleDays * 86400000
  rows = rows.map((r) => ({ ...r, stale: staleOn && Date.parse(r.last_verified) < cutoff }))
  if (search) {
    const s = search.toLowerCase()
    rows = rows.filter((r) => r.question.toLowerCase().includes(s) || r.answer.toLowerCase().includes(s))
  }
  if (filter === 'stale') rows = rows.filter((r) => r.stale)
  if (filter === 'duplicates') rows = rows.filter((r) => r.open_duplicates > 0)
  return rows
}

export function updateEntry(id, { question, answer }) {
  const entry = get('SELECT * FROM kb_entries WHERE id = ? AND archived = 0', id)
  if (!entry) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const q = clean(question ?? entry.question)
  const a = String(answer ?? entry.answer).trim()
  if (!q || !a) throw new PlainError('Both a question and an answer are needed.')
  const ts = now()
  run('UPDATE kb_entries SET question = ?, answer = ?, normalized = ?, last_verified = ?, updated_at = ? WHERE id = ?', q, a, normalize(q), ts, ts, id)
}

export function verifyEntry(id) {
  run('UPDATE kb_entries SET last_verified = ? WHERE id = ?', now(), id)
}

export function archiveEntry(id) {
  run('UPDATE kb_entries SET archived = 1, updated_at = ? WHERE id = ?', now(), id)
  run("UPDATE kb_duplicates SET status = 'resolved' WHERE entry_id = ? OR existing_id = ?", id, id)
}

export function listDuplicates() {
  return all(
    `SELECT d.id, d.similarity, d.created_at,
            n.id AS new_id, n.question AS new_question, n.answer AS new_answer, n.source_label AS new_source,
            o.id AS old_id, o.question AS old_question, o.answer AS old_answer, o.source_label AS old_source
     FROM kb_duplicates d JOIN kb_entries n ON n.id = d.entry_id JOIN kb_entries o ON o.id = d.existing_id
     WHERE d.status = 'open' AND n.archived = 0 AND o.archived = 0 ORDER BY d.created_at DESC`
  )
}

export function resolveDuplicate(id, action) {
  const d = get('SELECT * FROM kb_duplicates WHERE id = ?', id)
  if (!d) throw new PlainError(MESSAGES.notFound, { status: 404 })
  if (action === 'keep_new') archiveEntry(d.existing_id)
  else if (action === 'keep_existing') archiveEntry(d.entry_id)
  else if (action !== 'keep_both') throw new PlainError('Please choose which answer to keep.')
  run("UPDATE kb_duplicates SET status = ? WHERE id = ?", action === 'keep_both' ? 'kept_both' : 'resolved', id)
}

// ---------- imports (CSV / XLSX upload) ----------

export async function rowsFromUpload(filePath, filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) return Papa.parse(fs.readFileSync(filePath, 'utf8'), { skipEmptyLines: false }).data
  if (lower.endsWith('.xlsx')) {
    const sheets = await readXlsx(filePath)
    // The sheet with the most usable question/answer pairs.
    let best = sheets[0]?.rows || []
    let bestCount = -1
    for (const s of sheets) {
      const cols = detectKbColumns(s.rows)
      const count = cols ? s.rows.filter((r) => clean(r[cols.q]) && clean(r[cols.a])).length : 0
      if (count > bestCount) {
        best = s.rows
        bestCount = count
      }
    }
    return best
  }
  throw new PlainError('Please upload a CSV or Excel (.xlsx) file.')
}

/** Describe detected columns in plain words, with a few sample pairs for the confirmation preview. */
export function describeColumns(rows, cols) {
  const header = cols.headerRow >= 0 ? rows[cols.headerRow] : null
  const name = (i) => `column ${columnLetter(i)}${header && clean(header[i]) ? ` (“${clean(header[i])}”)` : ''}`
  const pairs = pairsFromRows(rows, cols)
  const width = Math.max(0, ...rows.map((r) => r.length))
  return {
    summary: `Questions in ${name(cols.q)}, answers in ${name(cols.a)}`,
    confidence: cols.confidence,
    q: cols.q,
    a: cols.a,
    headerRow: cols.headerRow,
    count: pairs.length,
    sample: pairs.slice(0, 5),
    columns: Array.from({ length: width }, (_, i) => ({ index: i, label: name(i) }))
  }
}

export function pairsFromRows(rows, { q, a, headerRow }) {
  const out = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const question = clean(rows[r]?.[q])
    const answer = String(rows[r]?.[a] ?? '').trim()
    if (question && answer) out.push({ question, answer, row: r + 1 })
  }
  return out
}

export function importPairs(pairs, { sourceType, sourceLabel, sourceId = null }) {
  return transaction(() => {
    const index = buildIndex(all('SELECT * FROM kb_entries WHERE archived = 0'))
    let added = 0
    let duplicates = 0
    for (const p of pairs) {
      const r = addEntry({ question: p.question, answer: p.answer, sourceType, sourceLabel: sourceLabel(p), sourceRef: p.ref || null, sourceId }, index)
      added++
      if (r.duplicate) duplicates++
    }
    return { added, duplicates }
  })
}

/**
 * Re-sync a connected sheet: update answers that changed, add new rows, retire rows that are gone.
 * Entries from this source are keyed by their normalized question.
 */
export function applySync(source, pairs) {
  return transaction(() => {
    const existing = all('SELECT * FROM kb_entries WHERE source_id = ? AND source_type = ? AND archived = 0', source.id, 'sheet')
    const byNorm = new Map(existing.map((e) => [e.normalized, e]))
    const seen = new Set()
    const others = buildIndex(all('SELECT * FROM kb_entries WHERE archived = 0 AND (source_id IS NULL OR source_id != ?)', source.id))
    const ts = now()
    let added = 0
    let updated = 0
    let duplicates = 0
    for (const p of pairs) {
      const norm = normalize(p.question)
      if (seen.has(norm)) continue
      seen.add(norm)
      const label = `${source.label}, row ${p.row}`
      const found = byNorm.get(norm)
      if (found) {
        if (found.answer !== p.answer || found.source_label !== label) {
          run('UPDATE kb_entries SET answer = ?, source_label = ?, source_ref = ?, last_verified = ?, updated_at = ? WHERE id = ?', p.answer, label, String(p.row), ts, ts, found.id)
          updated++
        } else run('UPDATE kb_entries SET last_verified = ? WHERE id = ?', ts, found.id)
      } else {
        const r = addEntry({ question: p.question, answer: p.answer, sourceType: 'sheet', sourceLabel: label, sourceRef: String(p.row), sourceId: source.id }, others)
        added++
        if (r.duplicate) duplicates++
      }
    }
    let removed = 0
    for (const e of existing) {
      if (!seen.has(e.normalized)) {
        archiveEntry(e.id)
        removed++
      }
    }
    return { added, updated, removed, duplicates, total: seen.size }
  })
}

// ---------- sample data, so a first-time user can try the flow before connecting anything ----------

const SAMPLE = [
  ['Is customer data encrypted at rest?', 'Yes. All customer data is encrypted at rest using AES-256.'],
  ['How is data encrypted in transit?', 'All traffic uses TLS 1.2 or higher. Older protocols are disabled.'],
  ['Do you support single sign-on (SSO)?', 'Yes. We support SAML 2.0 and OpenID Connect with any standard identity provider.'],
  ['Where is customer data hosted?', 'Customer data is hosted in AWS data centers in the United States (us-east-1), with a backup region in us-west-2.'],
  ['How long are backups retained?', 'Encrypted backups are taken daily and kept for 35 days.'],
  ['Do you have a documented incident response plan?', 'Yes. Our incident response plan is reviewed and tested at least once a year.'],
  ['Do employees complete security awareness training?', 'Yes. All employees complete security training when they join and every year after.'],
  ['Is multi-factor authentication required for staff?', 'Yes. Multi-factor authentication is required for all staff access to production systems.']
]

export function loadSample() {
  return importPairs(
    SAMPLE.map(([question, answer]) => ({ question, answer })),
    { sourceType: 'sample', sourceLabel: () => sourceLabels.sample() }
  )
}
