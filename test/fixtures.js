// Builds real sample files for tests: a generic vendor questionnaire in every supported format.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } from 'docx'

export const QUESTIONS = [
  ['1.1', 'Is customer data encrypted at rest?'],
  ['1.2', 'Describe how data is encrypted in transit.'],
  ['1.3', 'Do you support single sign-on (SSO)?'],
  ['2.1', 'Where are your production servers located?'],
  ['2.2', 'Provide your backup retention period.'],
  ['2.3', 'Do you have a dedicated quantum computing research lab?']
]

export function fixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qf-fixtures-'))
}

export async function makeXlsx(dir, { headers = true } = {}) {
  const wb = new ExcelJS.Workbook()
  const intro = wb.addWorksheet('Instructions')
  intro.addRow(['Please complete every tab of this questionnaire.'])
  const ws = wb.addWorksheet('Security')
  if (headers) ws.addRow(['Ref', 'Question', 'Response', 'Notes'])
  ws.addRow(['', 'Data Protection', '', ''])
  QUESTIONS.forEach(([id, q]) => ws.addRow([id, q, '', '']))
  const file = path.join(dir, headers ? 'vendor.xlsx' : 'vendor-noheader.xlsx')
  await wb.xlsx.writeFile(file)
  return file
}

export function makeCsv(dir) {
  const file = path.join(dir, 'vendor.csv')
  fs.writeFileSync(file, 'No.,Query,Answer\n' + QUESTIONS.map(([id, q]) => `${id},"${q}",`).join('\n') + '\n')
  return file
}

export async function makeDocx(dir) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Vendor Security Questionnaire', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Please answer the following questions.' }),
          new Paragraph({ text: 'Data Protection', heading: HeadingLevel.HEADING_2 }),
          ...QUESTIONS.slice(0, 3).map(([id, q]) => new Paragraph({ children: [new TextRun(`${id} ${q}`)] })),
          new Paragraph({ text: 'Infrastructure', heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              ['#', 'Question', 'Answer'],
              ...QUESTIONS.slice(3).map(([id, q]) => [id, q, ''])
            ].map((cells) => new TableRow({ children: cells.map((c) => new TableCell({ children: [new Paragraph(c)] })) }))
          })
        ]
      }
    ]
  })
  const file = path.join(dir, 'vendor.docx')
  fs.writeFileSync(file, await Packer.toBuffer(doc))
  return file
}

export function makePdf(dir, name = 'vendor.pdf') {
  const file = path.join(dir, name)
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 60 })
    const out = fs.createWriteStream(file)
    doc.pipe(out)
    doc.fontSize(18).text('Vendor Security Questionnaire')
    doc.moveDown().fontSize(11).text('Please answer the following questions.')
    doc.moveDown().fontSize(13).text('Data Protection')
    doc.fontSize(11)
    QUESTIONS.forEach(([id, q], i) => {
      if (i === 3) doc.moveDown().fontSize(13).text('Infrastructure').fontSize(11)
      doc.moveDown(0.5).text(`${id} ${q}`)
      doc.text('Answer: ______________________')
    })
    doc.end()
    out.on('finish', () => resolve(file))
  })
}

/** An image-only PDF: the text PDF rendered to a picture, then wrapped in a new PDF. */
export async function makeScannedPdf(dir) {
  const textPdf = await makePdf(dir, 'source-for-scan.pdf')
  execFileSync('pdftoppm', ['-r', '150', '-png', '-singlefile', textPdf, path.join(dir, 'scan')])
  const file = path.join(dir, 'scanned.pdf')
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: 'LETTER' })
    const out = fs.createWriteStream(file)
    doc.pipe(out)
    doc.image(path.join(dir, 'scan.png'), 0, 0, { width: 612 })
    doc.end()
    out.on('finish', () => resolve(file))
  })
}

export const PASTE = `Security questions for Acme Corp
1) Is customer data encrypted at rest?
2) Describe how data is encrypted in transit.
3) Do you support single sign-on (SSO)?`
