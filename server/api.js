import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { all, get, run, now, allSettings, setSetting, UPLOAD_DIR } from './db.js'
import { formatOf } from './extract/index.js'
import { detectKbColumns } from './extract/table.js'
import { clean, normalize } from './extract/heuristics.js'
import * as kb from './kb.js'
import * as jobs from './jobs.js'
import { generateOutput, OUTPUT_FORMATS } from './output.js'
import { readSheetRows } from './viasocket/connections.js'
import { APPS } from './viasocket/apps.js'
import { emitLater } from './events.js'
import { PlainError, MESSAGES } from './plain.js'

export const router = Router()

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
})

const actor = (req) => ({ clientId: String(req.body?.clientId || req.query.clientId || ''), name: clean(req.body?.name || '') || null })

// ---------- settings ----------

router.get('/settings', (req, res) => {
  const s = allSettings()
  res.json({
    orgName: s.org_name,
    autofillThreshold: Number(s.autofill_threshold),
    reviewFloor: Number(s.review_floor),
    aiMatching: s.ai_matching === '1',
    stalenessEnabled: s.staleness_enabled === '1',
    stalenessDays: Number(s.staleness_days),
    onboardingDismissed: s.onboarding_dismissed === '1'
  })
})

router.put('/settings', (req, res) => {
  const b = req.body || {}
  const current = allSettings()
  const threshold = b.autofillThreshold ?? Number(current.autofill_threshold)
  const floor = b.reviewFloor ?? Number(current.review_floor)
  if (!(threshold >= 50 && threshold <= 100)) throw new PlainError('Choose an automatic-fill level between 50% and 100%.')
  if (!(floor >= 0 && floor < threshold)) throw new PlainError('The “suggest for review” level must be lower than the automatic-fill level.')
  setSetting('autofill_threshold', Math.round(threshold))
  setSetting('review_floor', Math.round(floor))
  if (b.orgName !== undefined) setSetting('org_name', clean(b.orgName) || 'My organization')
  if (b.aiMatching !== undefined) setSetting('ai_matching', b.aiMatching ? 1 : 0)
  if (b.stalenessEnabled !== undefined) setSetting('staleness_enabled', b.stalenessEnabled ? 1 : 0)
  if (b.stalenessDays !== undefined) {
    if (!(b.stalenessDays >= 7 && b.stalenessDays <= 3650)) throw new PlainError('Choose between 7 and 3650 days.')
    setSetting('staleness_days', Math.round(b.stalenessDays))
  }
  if (b.onboardingDismissed !== undefined) setSetting('onboarding_dismissed', b.onboardingDismissed ? 1 : 0)
  res.json({ ok: true, message: 'Settings saved.' })
})

// ---------- dashboard & analytics ----------

router.get('/dashboard', (req, res) => {
  const kbCount = get('SELECT COUNT(*) AS n FROM kb_entries WHERE archived = 0').n
  const sources = get('SELECT COUNT(*) AS n FROM kb_sources').n
  const jobRows = all("SELECT id FROM jobs WHERE kind != 'single'")
  const items = get(
    `SELECT COUNT(*) AS total, SUM(classification = 'auto') AS auto, SUM(review_status = 'pending' AND j.status IN ('review','ready')) AS pending
     FROM items i JOIN jobs j ON j.id = i.job_id WHERE j.kind != 'single' AND classification IS NOT NULL`
  )
  // Questions that keep coming back unanswered, most frequent first; "now answered" once the KB has them.
  const unanswered = all(
    `SELECT normalized, MIN(question) AS question, COUNT(*) AS times, MAX(j.created_at) AS last_seen
     FROM items i JOIN jobs j ON j.id = i.job_id WHERE classification = 'not_found'
     GROUP BY normalized ORDER BY times DESC, last_seen DESC LIMIT 10`
  ).map((u) => ({ ...u, nowAnswered: Boolean(get('SELECT 1 FROM kb_entries WHERE normalized = ? AND archived = 0', u.normalized)) }))
  const recent = all("SELECT id, title, status, status_message, created_at FROM jobs WHERE kind != 'single' ORDER BY id DESC LIMIT 5")
  const connections = all('SELECT app FROM connections').map((c) => c.app)
  res.json({
    kbCount,
    sources,
    jobs: jobRows.length,
    answered: items.total || 0,
    autoRate: items.total ? Math.round((100 * (items.auto || 0)) / items.total) : null,
    pendingReview: items.pending || 0,
    duplicates: kb.listDuplicates().length,
    unanswered,
    recent,
    connections
  })
})

// ---------- knowledge base ----------

router.get('/kb', (req, res) => {
  res.json({ entries: kb.listEntries({ search: String(req.query.search || ''), filter: String(req.query.filter || '') }) })
})

router.post('/kb', (req, res) => {
  const { question, answer, name } = req.body || {}
  const r = kb.addEntry({ question, answer, sourceType: 'manual', sourceLabel: kb.sourceLabels.manual(clean(name)) })
  res.json({ ...r, message: r.duplicate ? 'Saved. It looks a lot like an answer you already have, so we flagged it for a quick check.' : 'Saved to your knowledge base.' })
})

router.put('/kb/:id', (req, res) => {
  kb.updateEntry(Number(req.params.id), req.body || {})
  res.json({ ok: true, message: 'Answer updated.' })
})

router.post('/kb/:id/verify', (req, res) => {
  kb.verifyEntry(Number(req.params.id))
  res.json({ ok: true, message: 'Marked as checked today.' })
})

router.delete('/kb/:id', (req, res) => {
  kb.archiveEntry(Number(req.params.id))
  res.json({ ok: true, message: 'Answer removed from your knowledge base.' })
})

router.get('/kb/duplicates', (req, res) => res.json({ duplicates: kb.listDuplicates() }))

router.post('/kb/duplicates/:id', (req, res) => {
  kb.resolveDuplicate(Number(req.params.id), req.body?.action)
  res.json({ ok: true })
})

router.post('/kb/sample', (req, res) => {
  const existing = get("SELECT COUNT(*) AS n FROM kb_entries WHERE source_type = 'sample' AND archived = 0").n
  if (existing) return res.json({ added: 0, message: 'The sample answers are already loaded.' })
  const r = kb.loadSample()
  res.json({ ...r, message: `Added ${r.added} sample answers. Replace them with your own whenever you're ready.` })
})

// Import a CSV/XLSX of question/answer pairs. Columns are detected; we only ask when unsure.
const pendingImports = new Map()

router.post('/kb/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new PlainError('Choose a CSV or Excel file to import.')
  try {
    const rows = await kb.rowsFromUpload(req.file.path, req.file.originalname)
    const cols = detectKbColumns(rows)
    if (!cols) throw new PlainError("We couldn't find a column of questions and a column of answers in this file.")
    const preview = kb.describeColumns(rows, cols)
    if (!preview.count) throw new PlainError("We found the columns, but no rows that have both a question and an answer.")
    const token = crypto.randomUUID()
    pendingImports.set(token, { rows, filename: req.file.originalname, at: Date.now() })
    if (cols.confidence >= jobs.CONFIRM_BELOW && req.query.auto !== '0') {
      const result = commitImport(token, cols)
      return res.json({ done: true, ...result, summary: preview.summary })
    }
    res.json({ done: false, token, preview })
  } finally {
    fs.rmSync(req.file.path, { force: true })
  }
})

router.post('/kb/import/:token', (req, res) => {
  const { q, a, headerRow } = req.body || {}
  if (q === a) throw new PlainError('The question and answer columns need to be different.')
  res.json({ done: true, ...commitImport(req.params.token, { q: Number(q), a: Number(a), headerRow: Number(headerRow) }) })
})

function commitImport(token, cols) {
  const pending = pendingImports.get(token)
  if (!pending) throw new PlainError('This import has expired. Please choose the file again.')
  pendingImports.delete(token)
  for (const [k, v] of pendingImports) if (Date.now() - v.at > 3600000) pendingImports.delete(k)
  const pairs = kb.pairsFromRows(pending.rows, cols)
  const r = kb.importPairs(pairs, { sourceType: 'import', sourceLabel: (p) => `${kb.sourceLabels.import(pending.filename)}, row ${p.row}` })
  return {
    ...r,
    message: `Added ${r.added} answer${r.added === 1 ? '' : 's'}.${r.duplicates ? ` ${r.duplicates} look like answers you already have — check them under “Possible duplicates”.` : ''}`
  }
}

// ---------- connected sheets that feed the knowledge base (read-only) ----------

router.get('/kb/sources', (req, res) => {
  const rows = all('SELECT * FROM kb_sources ORDER BY created_at').map((s) => ({
    ...s,
    config: JSON.parse(s.config),
    appName: APPS[s.app]?.name,
    icon: APPS[s.app]?.icon
  }))
  res.json({ sources: rows })
})

router.post('/kb/sources', async (req, res) => {
  const { app, config } = req.body || {}
  if (!['google_sheets', 'excel'].includes(app)) throw new PlainError('Choose Google Sheets or Excel.')
  const parts = app === 'google_sheets' ? [config?.spreadsheet, config?.sheet] : [config?.storage, config?.sheet, config?.worksheet, config?.table]
  if (parts.some((p) => !p?.value)) throw new PlainError('Please finish choosing where your answers are.')
  const label = app === 'google_sheets' ? `${config.spreadsheet.label} › ${config.sheet.label}` : `${config.sheet.label} › ${config.worksheet.label} › ${config.table.label}`
  const info = run('INSERT INTO kb_sources (app, label, config, created_at) VALUES (?, ?, ?, ?)', app, label, JSON.stringify(config), now())
  const id = Number(info.lastInsertRowid)
  try {
    res.json(await syncSource(id))
  } catch (err) {
    run('DELETE FROM kb_sources WHERE id = ?', id)
    throw err
  }
})

router.post('/kb/sources/:id/sync', async (req, res) => res.json(await syncSource(Number(req.params.id))))

router.delete('/kb/sources/:id', (req, res) => {
  const keep = req.query.keepAnswers === '1'
  if (!keep) for (const e of all('SELECT id FROM kb_entries WHERE source_id = ? AND archived = 0', req.params.id)) kb.archiveEntry(e.id)
  else run("UPDATE kb_entries SET source_type = 'import', source_id = NULL, source_label = source_label || ' (no longer synced)' WHERE source_id = ?", req.params.id)
  run('DELETE FROM kb_sources WHERE id = ?', req.params.id)
  res.json({ ok: true, message: keep ? 'Stopped syncing. The answers stay in your knowledge base.' : 'Source removed, along with the answers that came from it.' })
})

async function syncSource(id) {
  const source = get('SELECT * FROM kb_sources WHERE id = ?', id)
  if (!source) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const rows = await readSheetRows(source.app, JSON.parse(source.config))
  const cols = detectKbColumns(rows)
  if (!cols) {
    run('UPDATE kb_sources SET last_synced_at = ?, last_status = ? WHERE id = ?', now(), "We couldn't find a question column and an answer column", id)
    throw new PlainError("We read the sheet, but couldn't find a column of questions next to a column of answers. Check that the sheet has both.")
  }
  const pairs = kb.pairsFromRows(rows, cols)
  const r = kb.applySync(source, pairs)
  const status = `${r.total} answers · ${r.added} new, ${r.updated} updated, ${r.removed} removed`
  run('UPDATE kb_sources SET last_synced_at = ?, last_status = ?, row_count = ?, question_col = ?, answer_col = ? WHERE id = ?', now(), status, r.total, String(cols.q), String(cols.a), id)
  return {
    ...r,
    message: `Synced ${r.total} answers (${r.added} new, ${r.updated} updated${r.removed ? `, ${r.removed} no longer in the sheet` : ''}).${r.duplicates ? ` ${r.duplicates} look like answers you already have.` : ''}`
  }
}

// ---------- questionnaires ----------

router.get('/jobs', (req, res) => {
  const rows = all("SELECT * FROM jobs WHERE kind != 'single' ORDER BY id DESC LIMIT 100").map((j) => {
    const c = get(
      "SELECT COUNT(*) AS total, SUM(review_status = 'pending') AS pending FROM items WHERE job_id = ?",
      j.id
    )
    return { id: j.id, title: j.title, kind: j.kind, status: j.status, status_message: j.status_message, created_at: j.created_at, total: c.total, pending: c.pending || 0, input_format: j.input_format }
  })
  res.json({ jobs: rows })
})

router.post('/jobs', upload.single('file'), async (req, res) => {
  const mode = req.file ? 'file' : req.body?.mode
  const wanted = String(req.body?.outputFormat || 'same')
  let id
  if (mode === 'file') {
    const format = formatOf(req.file.originalname)
    if (!format) {
      fs.rmSync(req.file.path, { force: true })
      throw new PlainError(MESSAGES.fileType)
    }
    fs.chmodSync(req.file.path, 0o444) // our stored copy of the original is read-only
    const out = wanted === 'same' ? format : wanted
    id = jobs.createJob({ kind: 'file', title: clean(req.body?.title) || req.file.originalname.replace(/\.[^.]+$/, ''), filename: req.file.originalname, filePath: req.file.path, inputFormat: format, outputFormat: OUTPUT_FORMATS.includes(out) ? out : format })
    jobs.processJob(id)
  } else if (mode === 'paste') {
    const text = String(req.body?.text || '')
    if (!clean(text)) throw new PlainError('Paste at least one question.')
    id = jobs.createJob({ kind: 'paste', title: clean(req.body?.title) || `Pasted questions — ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`, inputFormat: 'text', outputFormat: OUTPUT_FORMATS.includes(wanted) ? wanted : 'docx' })
    jobs.processJob(id, { text })
  } else if (mode === 'sheet') {
    const { app, config } = req.body
    if (!['google_sheets', 'excel'].includes(app)) throw new PlainError('Choose Google Sheets or Excel.')
    const rows = await readSheetRows(app, config)
    const label = app === 'google_sheets' ? `${config.spreadsheet?.label} › ${config.sheet?.label}` : `${config.sheet?.label} › ${config.worksheet?.label}`
    id = jobs.createJob({ kind: 'sheet', title: clean(req.body?.title) || label, inputFormat: 'sheet', outputFormat: OUTPUT_FORMATS.includes(wanted) ? wanted : 'xlsx' })
    jobs.processJob(id, { rows })
  } else {
    throw new PlainError('Upload a file, paste questions, or pick a sheet.')
  }
  res.json({ id })
})

router.get('/jobs/:id', (req, res) => res.json(jobs.jobView(Number(req.params.id))))

router.put('/jobs/:id', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', req.params.id)
  if (!job) throw new PlainError(MESSAGES.notFound, { status: 404 })
  if (req.body.title !== undefined) run('UPDATE jobs SET title = ? WHERE id = ?', clean(req.body.title) || job.title, job.id)
  if (req.body.outputFormat && OUTPUT_FORMATS.includes(req.body.outputFormat)) run('UPDATE jobs SET output_format = ? WHERE id = ?', req.body.outputFormat, job.id)
  res.json({ ok: true })
})

/** The user confirmed (and possibly edited) the detected questions: match them. */
router.post('/jobs/:id/confirm', async (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', req.params.id)
  if (!job) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const list = Array.isArray(req.body?.items) ? req.body.items : null
  if (list) {
    const old = new Map(all('SELECT * FROM items WHERE job_id = ?', job.id).map((i) => [i.id, i]))
    const cleaned = list
      .map((it) => ({ ...it, question: clean(it.question) }))
      .filter((it) => it.question)
      .map((it) => ({ identifier: clean(it.identifier) || null, question: it.question, section: old.get(it.id)?.section || null, location: old.has(it.id) ? JSON.parse(old.get(it.id).location || '{}') : {} }))
    if (!cleaned.length) throw new PlainError('Add at least one question to continue.')
    run('DELETE FROM items WHERE job_id = ?', job.id)
    cleaned.forEach((it, i) =>
      run('INSERT INTO items (job_id, position, identifier, question, normalized, section, location) VALUES (?, ?, ?, ?, ?, ?, ?)', job.id, i + 1, it.identifier, it.question, normalize(it.question), it.section, JSON.stringify(it.location))
    )
  }
  jobs.matchJob(job.id).catch(() => {})
  res.json({ ok: true })
})

router.post('/jobs/:id/rematch', (req, res) => {
  const pending = get("SELECT COUNT(*) AS n FROM items WHERE job_id = ? AND review_status IN ('approved','fixed') AND reviewed_by != 'auto'", req.params.id).n
  if (pending && !req.body?.confirm) throw new PlainError('Matching again replaces answers people already reviewed in this questionnaire.', { status: 409 })
  jobs.matchJob(Number(req.params.id)).catch(() => {})
  res.json({ ok: true })
})

router.delete('/jobs/:id', (req, res) => {
  jobs.deleteJob(Number(req.params.id))
  res.json({ ok: true, message: 'Questionnaire deleted.' })
})

/** Finish: write a new completed file (the original is untouched) and tell the team. */
router.post('/jobs/:id/finish', async (req, res) => {
  const view = jobs.jobView(Number(req.params.id))
  const format = OUTPUT_FORMATS.includes(req.body?.outputFormat) ? req.body.outputFormat : view.output_format
  await generateOutput(view, view.items, format)
  const wasCompleted = view.status === 'completed'
  run("UPDATE jobs SET status = 'completed', status_message = ?, output_format = ?, completed_at = ? WHERE id = ?", jobs.STATUS_TEXT.completed, format, now(), view.id)
  const c = view.counts
  const blank = view.items.filter((i) => !i.final_answer).length
  const reviewed = view.items.filter((i) => ['approved', 'fixed'].includes(i.review_status) && i.reviewed_by !== 'auto').length
  if (!wasCompleted) emitLater('questionnaire.completed', { jobId: view.id, title: view.title, total: c.total, auto: c.auto, reviewed, blank })
  res.json({ ok: true, download: `/api/jobs/${view.id}/download?format=${format}` })
})

router.get('/jobs/:id/download', async (req, res) => {
  const view = jobs.jobView(Number(req.params.id))
  const format = OUTPUT_FORMATS.includes(req.query.format) ? req.query.format : view.output_format
  const file = await generateOutput(view, view.items, format)
  res.download(file, path.basename(file))
})

// ---------- review ----------

router.post('/items/:id/lock', (req, res) => {
  const { clientId, name } = actor(req)
  jobs.lockItem(Number(req.params.id), clientId, name)
  res.json({ ok: true })
})
router.post('/items/:id/unlock', (req, res) => {
  jobs.unlockItem(Number(req.params.id), actor(req).clientId)
  res.json({ ok: true })
})
router.post('/items/:id/approve', (req, res) => {
  const { clientId, name } = actor(req)
  jobs.approveItem(Number(req.params.id), clientId, name)
  res.json({ ok: true })
})
router.post('/items/:id/fix', (req, res) => {
  const { clientId, name } = actor(req)
  res.json(jobs.fixItem(Number(req.params.id), clientId, name, req.body?.answer))
})
router.post('/items/:id/skip', (req, res) => {
  const { clientId, name } = actor(req)
  jobs.skipItem(Number(req.params.id), clientId, name)
  res.json({ ok: true })
})
router.post('/items/:id/reopen', (req, res) => {
  jobs.reopenItem(Number(req.params.id), actor(req).clientId)
  res.json({ ok: true })
})

/** The feedback loop: a reviewer's correction becomes an approved knowledge-base answer. */
router.post('/items/:id/kb', (req, res) => {
  const it = get('SELECT * FROM items WHERE id = ?', req.params.id)
  if (!it) throw new PlainError(MESSAGES.notFound, { status: 404 })
  if (!req.body?.add) {
    run("UPDATE items SET kb_offer = 'declined' WHERE id = ?", it.id)
    return res.json({ ok: true })
  }
  if (!it.final_answer) throw new PlainError('There is no answer to save yet.')
  const r = kb.addEntry({ question: it.question, answer: it.final_answer, sourceType: 'review', sourceLabel: kb.sourceLabels.review(actor(req).name) })
  run("UPDATE items SET kb_offer = 'added' WHERE id = ?", it.id)
  res.json({ ok: true, ...r, message: r.duplicate ? 'Added. It is close to an answer you already have, so we flagged both for a quick check.' : 'Added to your knowledge base. Next time this question comes up, it will be answered automatically.' })
})

// ---------- one question, one answer ----------

router.post('/ask', async (req, res) => {
  const question = clean(req.body?.question)
  if (!question) throw new PlainError('Type a question first.')
  const id = jobs.createJob({ kind: 'single', title: `Quick question: ${question.slice(0, 60)}`, inputFormat: 'single', outputFormat: 'docx' })
  run('INSERT INTO items (job_id, position, question, normalized, location) VALUES (?, 1, ?, ?, ?)', id, question, normalize(question), '{}')
  await jobs.matchJob(id)
  const item = jobs.jobView(id).items[0]
  run("UPDATE jobs SET status = 'completed', status_message = ?, completed_at = ? WHERE id = ?", jobs.STATUS_TEXT.completed, now(), id)
  res.json({ item })
})

