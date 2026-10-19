// End-to-end checks of the product's own logic, on real generated files. No network: AI matching is
// switched off here so results are deterministic (the live AI path is proven by scripts/prove-viasocket.mjs).
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

process.env.QF_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-test-'))
const F = await import('./fixtures.js')
const { extract } = await import('../server/extract/index.js')
const { setSetting, get } = await import('../server/db.js')
const kb = await import('../server/kb.js')
const jobs = await import('../server/jobs.js')
const { generateOutput } = await import('../server/output.js')
const { toRows } = await import('../server/viasocket/connections.js')
const { APPS, FILTERED_SERVICES, filteredActions, setPath } = await import('../server/viasocket/apps.js')
const { buildMessage } = await import('../server/events.js')
const { MESSAGES } = await import('../server/plain.js')

const dir = F.fixtureDir()
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
const ids = (r) => r.items.map((i) => i.identifier)
const EXPECTED_IDS = F.QUESTIONS.map(([id]) => id)

before(() => {
  setSetting('ai_matching', 0)
  kb.loadSample()
})

test('XLSX: finds the question column by header, keeps numbering, skips the instructions tab', async () => {
  const r = await extract({ format: 'xlsx', filePath: await F.makeXlsx(dir) })
  assert.deepEqual(ids(r), EXPECTED_IDS)
  assert.ok(r.detection.confidence >= jobs.CONFIRM_BELOW)
  assert.equal(r.items[0].location.sheet, 'Security')
  assert.equal(r.items[0].location.aCol, 2) // the "Response" column
  assert.equal(r.items[0].section, 'Data Protection')
})

test('XLSX without headers: falls back to content shape', async () => {
  const r = await extract({ format: 'xlsx', filePath: await F.makeXlsx(dir, { headers: false }) })
  assert.deepEqual(ids(r), EXPECTED_IDS)
  assert.equal(r.detection.method, 'content')
})

test('CSV: header synonyms ("Query", "Answer", "No.")', async () => {
  const r = await extract({ format: 'csv', filePath: F.makeCsv(dir) })
  assert.deepEqual(ids(r), EXPECTED_IDS)
})

test('DOCX: numbered paragraphs and a table, in document order with sections', async () => {
  const r = await extract({ format: 'docx', filePath: await F.makeDocx(dir) })
  assert.deepEqual(ids(r), EXPECTED_IDS)
  assert.equal(r.items[3].section, 'Infrastructure')
})

test('PDF: text layer, imperative questions count, answer lines skipped', async () => {
  const r = await extract({ format: 'pdf', filePath: await F.makePdf(dir) })
  assert.deepEqual(ids(r), EXPECTED_IDS)
  assert.equal(r.items[1].question, 'Describe how data is encrypted in transit.')
})

test('Scanned PDF: OCR fallback, always asks for confirmation', async () => {
  const progress = []
  const r = await extract({ format: 'pdf', filePath: await F.makeScannedPdf(dir), onProgress: (m) => progress.push(m) })
  assert.equal(r.detection.ocr, true)
  assert.equal(r.items.length, 6)
  assert.ok(r.detection.confidence < jobs.CONFIRM_BELOW)
  assert.ok(progress.some((m) => /scanned/i.test(m)))
})

test('Paste and single question', async () => {
  const p = await extract({ format: 'text', text: F.PASTE })
  assert.deepEqual(ids(p), ['1', '2', '3'])
  const s = await extract({ format: 'single', text: '  How long are backups kept? ' })
  assert.equal(s.items.length, 1)
  assert.equal(s.items[0].question, 'How long are backups kept?')
})

async function runJob(filePath, format) {
  const id = jobs.createJob({ kind: 'file', title: 'Test', filename: path.basename(filePath), filePath, inputFormat: format, outputFormat: format })
  await jobs.processJob(id)
  return jobs.jobView(id)
}

test('Matching: auto-fill / needs review / not found, using the org threshold', async () => {
  const view = await runJob(await F.makeXlsx(dir), 'xlsx')
  const byId = Object.fromEntries(view.items.map((i) => [i.identifier, i]))
  assert.equal(byId['1.1'].classification, 'auto') // same wording
  assert.equal(byId['1.3'].classification, 'auto')
  assert.equal(byId['2.3'].classification, 'not_found') // nothing like it in the KB
  assert.equal(byId['1.1'].final_answer, byId['1.1'].suggested_answer)
  // Raising the threshold to 100 sends everything that isn't word-for-word to review.
  setSetting('autofill_threshold', 100)
  await jobs.matchJob(view.id)
  const strict = jobs.jobView(view.id)
  assert.ok(strict.items.filter((i) => i.classification === 'auto').every((i) => i.confidence === 100))
  setSetting('autofill_threshold', 85)
})

test('Review: looks good, fix it, lock conflicts, and the feedback loop into the knowledge base', async () => {
  const view = await runJob(await F.makeXlsx(dir), 'xlsx')
  const missing = view.items.find((i) => i.classification === 'not_found')
  jobs.lockItem(missing.id, 'client-a', 'Ana')
  assert.throws(() => jobs.fixItem(missing.id, 'client-b', 'Ben', 'x'), /Ana is working on this question/)
  const r = jobs.fixItem(missing.id, 'client-a', 'Ana', 'No, we do not run a quantum computing lab.')
  assert.equal(r.offerKb, true)
  const { id: entryId } = kb.addEntry({ question: missing.question, answer: 'No, we do not run a quantum computing lab.', sourceType: 'review', sourceLabel: kb.sourceLabels.review('Ana') })
  assert.match(get('SELECT source_label FROM kb_entries WHERE id = ?', entryId).source_label, /^Approved from review by Ana on /)
  // The same question in the next questionnaire is now answered automatically.
  const again = await runJob(await F.makeXlsx(dir), 'xlsx')
  assert.equal(again.items.find((i) => i.question === missing.question).classification, 'auto')
  // Approving without a suggestion is refused in plain words.
  const other = await runJob(await F.makeCsv(dir), 'csv')
  const pending = other.items.find((i) => i.review_status === 'pending' && !i.suggested_answer)
  if (pending) assert.throws(() => jobs.approveItem(pending.id, 'c', 'n'), /use “Fix it”/)
})

test('Output: any input to any format, original file untouched', async () => {
  const file = await F.makeXlsx(dir)
  const before = md5(file)
  const view = await runJob(file, 'xlsx')
  for (const fmt of ['xlsx', 'csv', 'docx', 'pdf']) {
    const out = await generateOutput(view, view.items, fmt)
    assert.ok(fs.statSync(out).size > 200, `${fmt} written`)
    assert.notEqual(path.resolve(out), path.resolve(file))
  }
  assert.equal(md5(file), before)
  const pdfView = await runJob(await F.makePdf(dir), 'pdf')
  const xlsxFromPdf = await generateOutput(pdfView, pdfView.items, 'xlsx')
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxFromPdf)
  assert.equal(wb.worksheets[0].getCell('A2').value, '1.1')
})

test('Knowledge base: import detection, duplicate flagging, sheet sync add/update/retire', async () => {
  const rows = [['Question', 'Answer'], ['Do you have a bug bounty program?', 'Yes, through a public platform.'], ['Is data encrypted at rest?', 'Yes, AES-256.']]
  const cols = (await import('../server/extract/table.js')).detectKbColumns(rows)
  assert.equal(cols.q, 0)
  assert.equal(cols.a, 1)
  const res = kb.importPairs(kb.pairsFromRows(rows, cols), { sourceType: 'import', sourceLabel: () => 'test' })
  assert.equal(res.added, 2)
  assert.equal(res.duplicates, 1) // close to the sample's "Is customer data encrypted at rest?"
  const source = { id: 999, label: 'Sheet › Tab' }
  let r = kb.applySync(source, [{ question: 'What is your uptime SLA?', answer: '99.9%', row: 2 }])
  assert.equal(r.added, 1)
  r = kb.applySync(source, [{ question: 'What is your uptime SLA?', answer: '99.95%', row: 2 }])
  assert.equal(r.updated, 1)
  r = kb.applySync(source, [])
  assert.equal(r.removed, 1)
})

test('Sheet rows: every response shape becomes rows', () => {
  assert.deepEqual(toRows({ data: [{ A: 'Q', B: 'A', _rowNumber: 1 }, { A: 'x?', B: 'y', _rowNumber: 2 }] }), [['Q', 'A'], ['x?', 'y']])
  assert.deepEqual(toRows([['Q', 'A'], ['x?', 'y']]), [['Q', 'A'], ['x?', 'y']])
  assert.deepEqual(toRows([{ Question: 'x?', Answer: 'y' }]), [['Question', 'Answer'], ['x?', 'y']])
})

test('viaSocket catalog: only the six apps, both ids per action, nested keys', () => {
  assert.deepEqual(FILTERED_SERVICES.sort(), ['rowbu58rc', 'rowln4ipb8r6', 'rowo0bqrhj5g', 'rowqm5xi2', 'rowtuwzc2a57', 'rowxzmscatfe'].sort())
  for (const app of Object.values(APPS)) {
    const action = app.read || app.send
    assert.ok(action.actionId && action.actionVersionId && action.actionId !== action.actionVersionId)
    assert.deepEqual(filteredActions(app), [action.actionId])
  }
  assert.deepEqual(setPath({}, 'destination.channel_id', ['C1']), { destination: { channel_id: ['C1'] } })
})

test('Messages: every event renders as plain text, and user-facing errors are plain sentences', () => {
  const m = buildMessage('answer.not_found', { jobId: 1, title: 'Acme', count: 2, questions: ['A?', 'B?'] })
  assert.match(m.subject, /2 unanswered questions: Acme/)
  assert.match(m.text, /• A\?/)
  const strings = Object.values(MESSAGES).map((v) => (typeof v === 'function' ? v('Slack') : v))
  for (const s of strings) assert.doesNotMatch(s, /error|exception|undefined|null|status|backend|api|token|oauth|credential/i)
})
