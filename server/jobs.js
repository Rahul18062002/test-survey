// A questionnaire's life: read it, confirm the questions if detection is unsure, match against the
// knowledge base, let people review, then produce a brand-new completed file.
import fs from 'node:fs'
import path from 'node:path'
import { all, get, run, now, transaction, OUTPUT_DIR } from './db.js'
import { extract } from './extract/index.js'
import { clean, normalize } from './extract/heuristics.js'
import { matchQuestions } from './match.js'
import { emitLater } from './events.js'
import { logError, toPlain, PlainError, MESSAGES } from './plain.js'

export const CONFIRM_BELOW = 80
const LOCK_MS = 5 * 60 * 1000

export const STATUS_TEXT = {
  reading: 'Reading your document…',
  matching: 'Finding answers in your knowledge base…',
  review: 'Ready for review',
  ready: 'All answers are filled in — ready to download',
  completed: 'Finished',
  failed: "We couldn't finish this one"
}

function setStatus(id, status, message = STATUS_TEXT[status]) {
  run('UPDATE jobs SET status = ?, status_message = ? WHERE id = ?', status, message, id)
}

export function createJob({ kind, title, filename = null, filePath = null, inputFormat, outputFormat }) {
  const info = run(
    'INSERT INTO jobs (title, kind, original_filename, original_path, input_format, output_format, status, status_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    title, kind, filename, filePath, inputFormat, outputFormat, 'reading', STATUS_TEXT.reading, now()
  )
  return Number(info.lastInsertRowid)
}

function insertItems(jobId, items) {
  transaction(() => {
    run('DELETE FROM items WHERE job_id = ?', jobId)
    items.forEach((it, i) => {
      const question = clean(it.question)
      if (!question) return
      run(
        'INSERT INTO items (job_id, position, identifier, question, normalized, section, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
        jobId, i + 1, it.identifier ? String(it.identifier) : null, question, normalize(question), it.section || null, JSON.stringify(it.location || {})
      )
    })
  })
}

/** Background: extraction, then matching unless the user needs to confirm what we found. */
export async function processJob(jobId, input) {
  try {
    const job = get('SELECT * FROM jobs WHERE id = ?', jobId)
    const result = await extract({
      format: job.input_format,
      filePath: job.original_path,
      text: input?.text,
      rows: input?.rows,
      onProgress: (m) => setStatus(jobId, 'reading', m)
    })
    run('UPDATE jobs SET detection = ? WHERE id = ?', JSON.stringify({ ...result.detection, count: result.items.length }), jobId)
    insertItems(jobId, result.items)
    if (!result.items.length) return setStatus(jobId, 'confirm', MESSAGES.noQuestions)
    if (result.detection.confidence < CONFIRM_BELOW) {
      const n = result.items.length
      return setStatus(jobId, 'confirm', `We found ${n} question${n === 1 ? '' : 's'} — does this look right?`)
    }
    await matchJob(jobId)
  } catch (err) {
    logError(`job ${jobId}`, err)
    setStatus(jobId, 'failed', toPlain(err).message)
  }
}

export async function matchJob(jobId) {
  setStatus(jobId, 'matching')
  const items = all('SELECT * FROM items WHERE job_id = ? ORDER BY position', jobId)
  const results = await matchQuestions(items, `job${jobId}`, (m) => setStatus(jobId, 'matching', m))
  transaction(() => {
    items.forEach((it, i) => {
      const r = results[i]
      const auto = r.classification === 'auto'
      run(
        `UPDATE items SET match_entry_id = ?, matched_question = ?, suggested_answer = ?, confidence = ?, match_method = ?, classification = ?,
           final_answer = ?, review_status = ?, reviewed_by = ?, reviewed_at = ?, kb_offer = NULL WHERE id = ?`,
        r.entry?.id ?? null, r.entry?.question ?? null, r.entry?.answer ?? null, r.confidence, r.stale ? `${r.method}+stale` : r.method,
        r.classification, auto ? r.entry.answer : null, auto ? 'approved' : 'pending', auto ? 'auto' : null, auto ? now() : null, it.id
      )
    })
  })
  const job = get('SELECT * FROM jobs WHERE id = ?', jobId)
  const pending = results.filter((r) => r.classification !== 'auto').length
  setStatus(jobId, pending ? 'review' : 'ready')
  const review = results.filter((r) => r.classification === 'review').length
  const missing = items.filter((_, i) => results[i].classification === 'not_found')
  if (job.kind !== 'single' && review) emitLater('review.pending', { jobId, title: job.title, count: review })
  if (missing.length) emitLater('answer.not_found', { jobId: job.kind === 'single' ? null : jobId, title: job.title, count: missing.length, questions: missing.map((m) => m.question) })
}

export function jobView(jobId) {
  const job = get('SELECT * FROM jobs WHERE id = ?', jobId)
  if (!job) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const items = all('SELECT * FROM items WHERE job_id = ? ORDER BY position', jobId).map(itemView)
  return { ...job, detection: job.detection ? JSON.parse(job.detection) : null, counts: counts(items), items }
}

export function itemView(it) {
  const locked = it.locked_until && it.locked_until > Date.now()
  const entry = it.match_entry_id ? get('SELECT source_label, last_verified FROM kb_entries WHERE id = ?', it.match_entry_id) : null
  const { locked_by: _secret, location, ...rest } = it
  return {
    ...rest,
    location: JSON.parse(location || '{}'),
    lockedByClient: locked ? it.locked_by : null,
    lockedName: locked ? it.locked_name : null,
    source: entry?.source_label || null,
    lastVerified: entry?.last_verified || null,
    stale: String(it.match_method || '').includes('stale')
  }
}

export function counts(items) {
  const c = { total: items.length, auto: 0, review: 0, not_found: 0, pending: 0, done: 0 }
  for (const it of items) {
    if (it.classification) c[it.classification]++
    if (it.review_status === 'pending') c.pending++
    else c.done++
  }
  return c
}

// ---------- review actions ----------

function itemOr404(id) {
  const it = get('SELECT * FROM items WHERE id = ?', id)
  if (!it) throw new PlainError(MESSAGES.notFound, { status: 404 })
  return it
}

function assertFree(it, clientId) {
  if (it.locked_until && it.locked_until > Date.now() && it.locked_by && it.locked_by !== clientId) {
    throw new PlainError(MESSAGES.locked(it.locked_name), { status: 409 })
  }
}

export function lockItem(id, clientId, name) {
  const it = itemOr404(id)
  assertFree(it, clientId)
  run('UPDATE items SET locked_by = ?, locked_name = ?, locked_until = ? WHERE id = ?', clientId, name || 'A teammate', Date.now() + LOCK_MS, id)
}

export function unlockItem(id, clientId) {
  run('UPDATE items SET locked_by = NULL, locked_name = NULL, locked_until = NULL WHERE id = ? AND locked_by = ?', id, clientId)
}

function afterReview(jobId) {
  const job = get('SELECT * FROM jobs WHERE id = ?', jobId)
  if (job.status === 'review' || job.status === 'ready') {
    const pending = get("SELECT COUNT(*) AS n FROM items WHERE job_id = ? AND review_status = 'pending'", jobId).n
    setStatus(jobId, pending ? 'review' : 'ready')
  }
}

export function approveItem(id, clientId, name) {
  const it = itemOr404(id)
  assertFree(it, clientId)
  if (!it.suggested_answer) throw new PlainError('There is no suggested answer to approve yet — use “Fix it” to write one.')
  run(
    "UPDATE items SET final_answer = suggested_answer, review_status = 'approved', reviewed_by = ?, reviewed_at = ?, locked_by = NULL, locked_name = NULL, locked_until = NULL WHERE id = ?",
    name || 'A teammate', now(), id
  )
  afterReview(it.job_id)
}

export function fixItem(id, clientId, name, answer) {
  const it = itemOr404(id)
  assertFree(it, clientId)
  const text = String(answer ?? '').trim()
  if (!text) throw new PlainError('Please write the answer first.')
  // Offer the correction to the knowledge base unless it is just the suggested answer unchanged.
  const offer = text !== (it.suggested_answer || '').trim() ? 'offered' : null
  run(
    "UPDATE items SET final_answer = ?, review_status = 'fixed', reviewed_by = ?, reviewed_at = ?, kb_offer = ?, locked_by = NULL, locked_name = NULL, locked_until = NULL WHERE id = ?",
    text, name || 'A teammate', now(), offer, id
  )
  afterReview(it.job_id)
  return { offerKb: Boolean(offer) }
}

export function reopenItem(id, clientId) {
  const it = itemOr404(id)
  assertFree(it, clientId)
  run("UPDATE items SET review_status = 'pending', final_answer = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?", id)
  const job = get('SELECT status FROM jobs WHERE id = ?', it.job_id)
  if (job.status === 'ready' || job.status === 'completed') setStatus(it.job_id, 'review')
}

export function skipItem(id, clientId, name) {
  const it = itemOr404(id)
  assertFree(it, clientId)
  run("UPDATE items SET review_status = 'skipped', final_answer = NULL, reviewed_by = ?, reviewed_at = ?, locked_by = NULL, locked_name = NULL, locked_until = NULL WHERE id = ?", name || 'A teammate', now(), id)
  afterReview(it.job_id)
}

export function deleteJob(id) {
  const job = get('SELECT * FROM jobs WHERE id = ?', id)
  if (!job) return
  run('DELETE FROM jobs WHERE id = ?', id)
  // Our stored copy of the upload and any generated outputs — never anything outside the data folder.
  if (job.original_path) fs.rmSync(job.original_path, { force: true })
  fs.rmSync(path.join(OUTPUT_DIR, String(id)), { recursive: true, force: true })
}
