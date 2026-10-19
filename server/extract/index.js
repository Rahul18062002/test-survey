// Read any supported input into a list of questions, plus a summary of what was detected and how
// sure we are. Nothing here writes to the uploaded file.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import mammoth from 'mammoth'
import { parse as parseHtml } from 'node-html-parser'
import { detectTable } from './table.js'
import { extractFromBlocks, blocksFromText } from './lines.js'
import { clean, detectionConfidence, questionStrength } from './heuristics.js'
import { PlainError, MESSAGES } from '../plain.js'

const execFileAsync = promisify(execFile)

export const SUPPORTED = { '.pdf': 'pdf', '.docx': 'docx', '.xlsx': 'xlsx', '.csv': 'csv' }

export function formatOf(filename) {
  return SUPPORTED[path.extname(filename || '').toLowerCase()] || null
}

/** onProgress(message) receives plain-language status updates for long reads (OCR). */
export async function extract({ format, filePath, text, rows, onProgress = () => {} }) {
  switch (format) {
    case 'xlsx':
      return fromWorkbook(await readXlsx(filePath))
    case 'csv':
      return fromWorkbook([{ name: null, rows: readCsv(filePath) }])
    case 'sheet':
      return fromWorkbook([{ name: null, rows }])
    case 'docx':
      return readDocx(filePath)
    case 'pdf':
      return readPdf(filePath, onProgress)
    case 'text':
      return fromPaste(text)
    case 'single':
      return fromSingle(text)
    default:
      throw new PlainError(MESSAGES.fileType)
  }
}

// ---------- spreadsheets ----------

export async function readXlsx(filePath) {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(filePath)
  } catch (err) {
    throw new PlainError(MESSAGES.fileUnreadable, { detail: `xlsx: ${err.message}` })
  }
  const sheets = []
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') return
    const rows = []
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        values[col - 1] = cellText(cell)
      })
      rows[rowNumber - 1] = values
    })
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
    sheets.push({ name: ws.name, rows })
  })
  return sheets
}

function cellText(cell) {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result)
    if (v.text) return String(v.text)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return String(v)
}

function readCsv(filePath) {
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8'), { skipEmptyLines: false })
  return parsed.data
}

function fromWorkbook(sheets) {
  const found = []
  for (const sheet of sheets) {
    const result = detectTable(sheet.rows)
    if (result) found.push({ sheet: sheet.name, ...result })
  }
  if (!found.length) return { items: [], detection: { method: 'none', confidence: 0, summary: MESSAGES.noQuestions } }
  // Sheets with few, weak finds (an "Instructions" tab) are dropped when a stronger sheet exists.
  const best = Math.max(...found.map((f) => f.items.length))
  const used = found.filter((f) => f.items.length >= Math.max(2, best * 0.1) || found.length === 1)
  const items = used.flatMap((f) => f.items.map((it) => ({ ...it, location: { ...it.location, sheet: f.sheet } })))
  const confidence = Math.min(...used.map((f) => f.confidence))
  const describe = (f) =>
    `${f.sheet ? `“${f.sheet}”: ` : ''}questions in column ${f.questionColumn.letter}${f.questionColumn.header ? ` (“${f.questionColumn.header}”)` : ''}` +
    (f.answerColumn ? `, answers go in column ${f.answerColumn.letter}${f.answerColumn.header ? ` (“${f.answerColumn.header}”)` : ''}` : ', answers will go in a new column')
  return {
    items,
    detection: {
      method: used.every((f) => f.method === 'header') ? 'header' : 'content',
      confidence,
      summary: used.map(describe).join('; '),
      sheets: used.map(({ items: _i, ...rest }) => rest)
    }
  }
}

// ---------- Word ----------

async function readDocx(filePath) {
  let html
  try {
    html = (await mammoth.convertToHtml({ path: filePath })).value
  } catch (err) {
    throw new PlainError(MESSAGES.fileUnreadable, { detail: `docx: ${err.message}` })
  }
  const root = parseHtml(`<body>${html}</body>`)
  const blocks = []
  const tableItems = []
  let order = 0

  const walkList = (listEl, prefix, ordered) => {
    let n = 0
    for (const li of listEl.childNodes.filter((c) => c.tagName === 'LI')) {
      n++
      const nested = li.childNodes.filter((c) => c.tagName === 'OL' || c.tagName === 'UL')
      nested.forEach((c) => c.remove())
      const id = ordered ? (prefix ? `${prefix}.${n}` : String(n)) : null
      blocks.push({ text: li.textContent, identifier: id, list: true, order: order++ })
      for (const sub of nested) walkList(sub, id || prefix, sub.tagName === 'OL')
    }
  }

  for (const node of root.querySelector('body').childNodes) {
    const tag = node.tagName
    if (!tag) continue
    if (/^H[1-6]$/.test(tag)) blocks.push({ text: node.textContent, heading: true, order: order++ })
    else if (tag === 'P') blocks.push({ text: node.textContent, order: order++ })
    else if (tag === 'OL' || tag === 'UL') walkList(node, '', tag === 'OL')
    else if (tag === 'TABLE') {
      const rows = node.querySelectorAll('tr').map((tr) => tr.querySelectorAll('td,th').map((td) => clean(td.textContent)))
      const found = detectTable(rows)
      if (found) {
        // Rows without a section of their own sit under the last heading above the table.
        const heading = [...blocks].reverse().find((b) => b.heading)
        if (heading) found.items.forEach((it) => (it.section ||= clean(heading.text)))
        tableItems.push({ order: order++, found })
      }
      else rows.forEach((r) => r.forEach((cell) => blocks.push({ text: cell, order: order++ })))
    }
  }

  // Keep document order: prose items and table items interleaved by where they appeared.
  const segments = []
  let pending = []
  const flush = () => {
    if (pending.length) segments.push(...extractFromBlocks(pending))
    pending = []
  }
  const tables = [...tableItems]
  for (const b of blocks) {
    while (tables.length && tables[0].order < b.order) {
      flush()
      segments.push(...tables.shift().found.items)
    }
    pending.push(b)
  }
  flush()
  for (const t of tables) segments.push(...t.found.items)

  const items = segments.map((it, i) => ({ ...it, location: { ...(it.location || {}), index: i } }))
  const tablePenalty = tableItems.some((t) => t.found.method === 'content') ? 10 : 0
  return {
    items,
    detection: {
      method: tableItems.length ? 'document+table' : 'document',
      confidence: detectionConfidence(items, { penalty: tablePenalty }),
      summary: items.length
        ? `${items.length} question${items.length === 1 ? '' : 's'} found in ${tableItems.length ? 'the text and tables' : 'the text'}`
        : MESSAGES.noQuestions
    }
  }
}

// ---------- PDF ----------

async function readPdf(filePath, onProgress) {
  let pages
  try {
    pages = await pdfLines(filePath)
  } catch (err) {
    throw new PlainError(MESSAGES.fileUnreadable, { detail: `pdf: ${err.message}` })
  }
  const textChars = pages.reduce((n, p) => n + p.join('').length, 0)
  let ocr = false
  if (textChars < 40 * pages.length) {
    onProgress('This looks like a scanned document — reading the text from the pages. This can take a minute.')
    pages = await ocrPdf(filePath, onProgress)
    ocr = true
  }
  // Drop running headers/footers: lines repeated on most pages, and page numbers.
  const counts = new Map()
  pages.forEach((lines) => new Set(lines).forEach((l) => counts.set(l, (counts.get(l) || 0) + 1)))
  const repeated = (l) => pages.length >= 3 && counts.get(l) >= Math.ceil(pages.length * 0.6)
  const blocks = []
  pages.forEach((lines, p) =>
    lines.forEach((l, i) => {
      if (/^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(l) || repeated(l)) return
      blocks.push({ text: l, location: { page: p + 1, line: i + 1 } })
    })
  )
  const items = extractFromBlocks(blocks)
  return {
    items,
    detection: {
      method: ocr ? 'ocr' : 'document',
      ocr,
      confidence: Math.min(detectionConfidence(items), ocr ? 70 : 100),
      summary: items.length
        ? `${items.length} question${items.length === 1 ? '' : 's'} found across ${pages.length} page${pages.length === 1 ? '' : 's'}${ocr ? ' (read from scanned images)' : ''}`
        : MESSAGES.noQuestions
    }
  }
}

async function pdfLines(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(fs.readFileSync(filePath))
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows = []
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue
      const y = item.transform[5]
      const x = item.transform[4]
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, (item.height || 10) * 0.4))
      if (!row) rows.push((row = { y, parts: [] }))
      row.parts.push({ x, str: item.str, w: item.width || 0 })
    }
    rows.sort((a, b) => b.y - a.y)
    const lines = rows.map((r) => {
      r.parts.sort((a, b) => a.x - b.x)
      // A wide horizontal gap means separate table cells: keep the question-like one, with a short id cell.
      const cells = []
      for (const part of r.parts) {
        const last = cells[cells.length - 1]
        if (last && part.x - (last.end || last.x) > 40) cells.push({ x: part.x, end: part.x + part.w, str: part.str })
        else if (last) {
          last.str += (part.x - (last.end || last.x) > 1 ? ' ' : '') + part.str
          last.end = part.x + part.w
        } else cells.push({ x: part.x, end: part.x + part.w, str: part.str })
      }
      if (cells.length > 1) {
        const q = cells.find((c) => ['strong', 'medium'].includes(questionStrength(c.str)))
        if (q) {
          const before = cells.slice(0, cells.indexOf(q)).map((c) => c.str.trim()).filter(Boolean)
          const id = before.length && before[before.length - 1].length <= 12 ? before[before.length - 1] : null
          return clean(id ? `${id}${/[.):]$/.test(id) ? '' : '.'} ${q.str}` : q.str)
        }
      }
      return clean(cells.map((c) => c.str).join(' '))
    })
    pages.push(lines.filter(Boolean))
  }
  return pages
}

async function ocrPdf(filePath, onProgress) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-ocr-'))
  try {
    try {
      await execFileAsync('pdftoppm', ['-r', '200', '-png', filePath, path.join(tmp, 'page')], { timeout: 180000 })
    } catch (err) {
      throw new PlainError(MESSAGES.ocrUnavailable, { detail: `pdftoppm: ${err.code || err.message}` })
    }
    const images = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort()
    if (!images.length) throw new PlainError(MESSAGES.ocrUnavailable, { detail: 'no page images' })
    const { createWorker } = await import('tesseract.js')
    const langPath = path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int')
    let worker
    try {
      worker = await createWorker('eng', 1, { langPath, gzip: true, cachePath: path.join(tmp, 'cache') })
    } catch (err) {
      throw new PlainError(MESSAGES.ocrUnavailable, { detail: `tesseract: ${err.message}` })
    }
    const pages = []
    try {
      for (let i = 0; i < images.length; i++) {
        onProgress(`Reading scanned page ${i + 1} of ${images.length}…`)
        const { data } = await worker.recognize(path.join(tmp, images[i]))
        pages.push(String(data.text).split(/\r?\n/).map(clean).filter(Boolean))
      }
    } finally {
      await worker.terminate()
    }
    return pages
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------- typed input ----------

function fromPaste(text) {
  const blocks = blocksFromText(text).map((b) => ({ ...b, list: true }))
  const items = extractFromBlocks(blocks).map((it, i) => ({ ...it, location: { line: i + 1 } }))
  return {
    items,
    detection: {
      method: 'paste',
      confidence: detectionConfidence(items),
      summary: items.length ? `${items.length} question${items.length === 1 ? '' : 's'} found in the pasted text` : MESSAGES.noQuestions
    }
  }
}

function fromSingle(text) {
  const question = clean(text)
  if (!question) return { items: [], detection: { method: 'single', confidence: 0, summary: 'Please type a question.' } }
  return {
    items: [{ identifier: null, question, section: null, strength: questionStrength(question) || 'weak', location: {} }],
    detection: { method: 'single', confidence: 100, summary: 'One question' }
  }
}
