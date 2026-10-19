// Produce a brand-new completed file in any format. The uploaded original is only ever read.
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import { OUTPUT_DIR } from './db.js'

export const OUTPUT_FORMATS = ['pdf', 'docx', 'xlsx', 'csv']

const answerOf = (it) => it.final_answer || ''
const label = (it) => it.identifier || String(it.position)

function baseName(job) {
  const raw = job.original_filename ? job.original_filename.replace(/\.[^.]+$/, '') : job.title
  return (raw.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'questionnaire').slice(0, 60)
}

export async function generateOutput(job, items, format) {
  if (!OUTPUT_FORMATS.includes(format)) throw new Error(`unsupported format ${format}`)
  const dir = path.join(OUTPUT_DIR, String(job.id))
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${baseName(job)}-completed.${format}`)
  if (format === 'xlsx') await writeXlsx(job, items, file)
  else if (format === 'csv') writeCsv(job, items, file)
  else if (format === 'docx') await writeDocx(job, items, file)
  else await writePdf(job, items, file)
  return file
}

// ---------- spreadsheets: refill a copy of the original layout when the input was a spreadsheet ----------

async function writeXlsx(job, items, file) {
  if (job.input_format === 'xlsx' && job.original_path && fs.existsSync(job.original_path)) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(job.original_path)
    const added = new Map() // sheet -> new answer column, when the source had none
    for (const it of items) {
      const loc = it.location || {}
      const ws = loc.sheet ? wb.getWorksheet(loc.sheet) : wb.worksheets[0]
      if (!ws || !loc.row) continue
      let col = loc.aCol
      if (col === undefined || col < 0) {
        if (!added.has(ws.name)) {
          const c = ws.columnCount + 1
          added.set(ws.name, c - 1)
          // Header goes just above the first question on this sheet.
          const top = items.filter((x) => (x.location?.sheet || null) === (loc.sheet || null)).map((x) => x.location.row)
          ws.getCell(Math.max(1, Math.min(...top) - 1), c).value = 'Answer'
        }
        col = added.get(ws.name)
      }
      ws.getCell(loc.row, col + 1).value = answerOf(it)
    }
    await wb.xlsx.writeFile(file)
    return
  }
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Answers')
  ws.columns = [
    { header: '#', key: 'id', width: 10 },
    { header: 'Section', key: 'section', width: 22 },
    { header: 'Question', key: 'question', width: 60 },
    { header: 'Answer', key: 'answer', width: 70 }
  ]
  ws.getRow(1).font = { bold: true }
  items.forEach((it) => ws.addRow({ id: label(it), section: it.section || '', question: it.question, answer: answerOf(it) }))
  ws.eachRow((row) => (row.alignment = { wrapText: true, vertical: 'top' }))
  await wb.xlsx.writeFile(file)
}

function writeCsv(job, items, file) {
  if (job.input_format === 'csv' && job.original_path && fs.existsSync(job.original_path)) {
    const rows = Papa.parse(fs.readFileSync(job.original_path, 'utf8'), { skipEmptyLines: false }).data
    let newCol = null
    for (const it of items) {
      const loc = it.location || {}
      if (!loc.row || !rows[loc.row - 1]) continue
      let col = loc.aCol
      if (col === undefined || col < 0) {
        if (newCol === null) {
          newCol = Math.max(...rows.map((r) => r.length))
          const headerIdx = Math.min(...items.map((x) => x.location?.row || Infinity)) - 2
          if (headerIdx >= 0 && rows[headerIdx]) rows[headerIdx][newCol] = 'Answer'
        }
        col = newCol
      }
      rows[loc.row - 1][col] = answerOf(it)
    }
    fs.writeFileSync(file, Papa.unparse(rows.filter((r, i) => i < rows.length - 1 || r.some((v) => v !== ''))))
    return
  }
  fs.writeFileSync(
    file,
    Papa.unparse([['#', 'Section', 'Question', 'Answer'], ...items.map((it) => [label(it), it.section || '', it.question, answerOf(it)])])
  )
}

// ---------- documents: a clean regenerated document, numbering preserved ----------

async function writeDocx(job, items, file) {
  const children = [new Paragraph({ text: job.title, heading: HeadingLevel.TITLE })]
  let section = null
  for (const it of items) {
    if (it.section && it.section !== section) {
      section = it.section
      children.push(new Paragraph({ text: section, heading: HeadingLevel.HEADING_2 }))
    }
    children.push(
      new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: `${label(it)}. `, bold: true }), new TextRun({ text: it.question, bold: true })] })
    )
    const answer = answerOf(it)
    for (const line of (answer || '(No answer provided)').split(/\r?\n/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, italics: !answer })] }))
    }
  }
  const doc = new Document({ creator: 'QuestionnaireFlow', title: job.title, sections: [{ children }] })
  fs.writeFileSync(file, await Packer.toBuffer(doc))
}

function writePdf(job, items, file) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, info: { Title: job.title, Creator: 'QuestionnaireFlow' } })
    const out = fs.createWriteStream(file)
    out.on('finish', resolve)
    out.on('error', reject)
    doc.pipe(out)
    doc.font('Helvetica-Bold').fontSize(18).text(job.title)
    doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#666').text(`Completed ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`)
    doc.fillColor('#000')
    let section = null
    for (const it of items) {
      if (it.section && it.section !== section) {
        section = it.section
        doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text(section)
      }
      doc.moveDown(0.7).font('Helvetica-Bold').fontSize(11).text(`${label(it)}. ${it.question}`)
      const answer = answerOf(it)
      doc.moveDown(0.2).font(answer ? 'Helvetica' : 'Helvetica-Oblique').fontSize(11).text(answer || '(No answer provided)')
    }
    doc.end()
  })
}
