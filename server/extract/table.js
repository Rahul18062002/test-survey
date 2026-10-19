// Find the question column (and answer / id columns) in a grid of cells, by header name first and by
// the shape of the content second. rows: string[][]. Returns null when nothing question-like is found.
import { clean, questionStrength, looksLikeHeading, looksLikeIdentifier } from './heuristics.js'

const Q_HEADER = /^(questions?|quer(y|ies)|items?|requirements?|controls?|control description|question text|question description|request|requests|criteria|prompts?|questionnaire|description of requirement)$/
const Q_HEADER_LOOSE = /\b(question|query|requirement|control description)\b/
const A_HEADER = /^(answers?|responses?|repl(y|ies)|comments?|vendor response|supplier response|your (answer|response)|explanation|answer\s*\/\s*comments?|response\s*\/\s*comments?|details)$/
const A_HEADER_LOOSE = /\b(answer|response|reply)\b/
const ID_HEADER = /^(#|no|number|id|ref|reference|item ?(no|number|#)|q ?#|q ?no|question ?(no|number|id|#)|s ?no|sr ?no|serial( no)?|control ?id|section)$/

const headerKey = (cell) => clean(cell).toLowerCase().replace(/[.:*()]/g, '').replace(/\s+/g, ' ').trim()

export function columnLetter(index) {
  let s = ''
  let n = index + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function findHeader(rows) {
  const limit = Math.min(rows.length, 20)
  for (let r = 0; r < limit; r++) {
    const keys = rows[r].map(headerKey)
    let q = keys.findIndex((k) => Q_HEADER.test(k))
    if (q < 0) q = keys.findIndex((k) => k.length <= 40 && Q_HEADER_LOOSE.test(k) && !A_HEADER_LOOSE.test(k))
    if (q < 0) continue
    let a = keys.findIndex((k, i) => i !== q && A_HEADER.test(k))
    if (a < 0) a = keys.findIndex((k, i) => i !== q && k.length <= 40 && A_HEADER_LOOSE.test(k))
    const id = keys.findIndex((k, i) => i !== q && i !== a && ID_HEADER.test(k))
    return { headerRow: r, q, a, id }
  }
  return null
}

function columnScores(rows, start) {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const scores = []
  for (let c = 0; c < width; c++) {
    let filled = 0
    let points = 0
    let length = 0
    for (let r = start; r < rows.length; r++) {
      const v = clean(rows[r][c])
      if (!v) continue
      filled++
      length += v.length
      const s = questionStrength(v)
      points += s === 'strong' ? 1 : s === 'medium' ? 0.75 : 0
    }
    scores.push({ c, filled, ratio: filled ? points / filled : 0, avgLen: filled ? length / filled : 0 })
  }
  return scores
}

function emptyRatio(rows, start, c) {
  let empty = 0
  let total = 0
  for (let r = start; r < rows.length; r++) {
    if (!rows[r].some((v) => clean(v))) continue
    total++
    if (!clean(rows[r][c])) empty++
  }
  return total ? empty / total : 1
}

export function detectTable(rows) {
  rows = rows.map((r) => (r || []).map((v) => (v === null || v === undefined ? '' : String(v))))
  if (!rows.length) return null
  const width = Math.max(0, ...rows.map((r) => r.length))
  let method
  let confidence
  let headerRow = -1
  let q
  let a = -1
  let id = -1

  const header = findHeader(rows)
  if (header) {
    ;({ headerRow, q, a, id } = header)
    method = 'header'
    confidence = a >= 0 ? 96 : 88
  } else {
    const scores = columnScores(rows, 0)
      .filter((s) => s.filled >= 1 && s.avgLen >= 12)
      .sort((x, y) => y.ratio * Math.log(1 + y.filled) - x.ratio * Math.log(1 + x.filled))
    if (!scores.length || scores[0].ratio < 0.3) return null
    q = scores[0].c
    method = 'content'
    const margin = scores[1] ? scores[0].ratio - scores[1].ratio : 1
    confidence = Math.round(55 + 30 * Math.min(1, scores[0].ratio) + (margin > 0.3 ? 8 : -10))
    // A first row of short labels above question-shaped content is a header we did not recognise.
    const first = rows[0] || []
    if (rows.length > 2 && !questionStrength(first[q] || '') && clean(first[q]).length < 30) headerRow = 0
  }

  const start = headerRow + 1
  // Answer column: by header, else the nearest column to the right that is mostly empty.
  if (a < 0) {
    for (let c = q + 1; c < width; c++) {
      if (c === id) continue
      if (emptyRatio(rows, start, c) >= 0.6) {
        a = c
        break
      }
    }
  }
  // Identifier column: by header, else a column left of the questions holding short codes.
  if (id < 0) {
    for (let c = 0; c < q; c++) {
      let codes = 0
      let filled = 0
      for (let r = start; r < rows.length; r++) {
        const v = clean(rows[r][c])
        if (!v) continue
        filled++
        if (looksLikeIdentifier(v)) codes++
      }
      if (filled && codes / filled >= 0.6) {
        id = c
        break
      }
    }
  }

  const items = []
  let section = null
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]
    const text = clean(row[q])
    if (!text) {
      // A label sitting alone in another column is often a section title.
      const lone = row.map(clean).filter(Boolean)
      if (lone.length === 1 && looksLikeHeading(lone[0])) section = lone[0]
      continue
    }
    const strength = questionStrength(text)
    const otherCells = row.filter((v, i) => i !== q && clean(v)).length
    const idValue = id >= 0 ? clean(row[id]) : ''
    if (!idValue && otherCells === 0 && strength === 'weak' && looksLikeHeading(text)) {
      section = text.replace(/:$/, '')
      continue
    }
    if (strength === null) continue
    items.push({
      identifier: idValue || null,
      question: text,
      section,
      strength,
      fromTable: true,
      existingAnswer: a >= 0 ? clean(row[a]) || null : null,
      location: { row: r + 1, qCol: q, aCol: a, idCol: id }
    })
  }
  if (!items.length) return null
  if (method === 'content' && items.length < 2) confidence = Math.min(confidence, 70)

  return {
    method,
    confidence: Math.max(0, Math.min(100, confidence)),
    headerRow: headerRow >= 0 ? headerRow + 1 : null,
    questionColumn: { index: q, letter: columnLetter(q), header: headerRow >= 0 ? clean(rows[headerRow][q]) : null },
    answerColumn: a >= 0 ? { index: a, letter: columnLetter(a), header: headerRow >= 0 ? clean(rows[headerRow][a]) : null } : null,
    idColumn: id >= 0 ? { index: id, letter: columnLetter(id), header: headerRow >= 0 ? clean(rows[headerRow][id]) : null } : null,
    items
  }
}

/**
 * For knowledge-base imports: the question column and a *filled* answer column.
 * Returns { headerRow, q, a, confidence, method } or null.
 */
export function detectKbColumns(rows) {
  rows = rows.map((r) => (r || []).map((v) => (v === null || v === undefined ? '' : String(v))))
  const header = findHeader(rows)
  if (header && header.a >= 0) return { headerRow: header.headerRow, q: header.q, a: header.a, method: 'header', confidence: 96 }
  const start = header ? header.headerRow + 1 : 0
  const scores = columnScores(rows, start).filter((s) => s.filled > 0)
  if (!scores.length) return null
  const q = header ? header.q : [...scores].sort((x, y) => y.ratio - x.ratio || y.filled - x.filled)[0]?.c
  if (q === undefined) return null
  // The answer column: the fullest column of real text other than the question column.
  const others = scores
    .filter((s) => s.c !== q && s.avgLen >= 2 && 1 - emptyRatio(rows, start, s.c) >= 0.5)
    .sort((x, y) => y.filled * Math.log(1 + y.avgLen) - x.filled * Math.log(1 + x.avgLen))
  if (!others.length) return null
  const qScore = scores.find((s) => s.c === q)
  let headerRow = header ? header.headerRow : -1
  if (!header && rows.length > 2 && !questionStrength(rows[0][q] || '') && clean(rows[0][q]).length < 30) headerRow = 0
  const confident = header ? 85 : qScore.ratio >= 0.6 && others.length === 1 ? 82 : 65
  return { headerRow, q, a: others[0].c, method: header ? 'header' : 'content', confidence: confident }
}
