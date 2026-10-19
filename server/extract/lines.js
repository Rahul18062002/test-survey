// Turn a stream of text blocks (PDF lines, DOCX paragraphs, pasted lines) into questions.
// A block: { text, identifier?, list?: boolean }. Wrapped lines are re-joined; headings become sections.
import { clean, splitNumbering, questionStrength, looksLikeHeading, looksLikeAnswerPlaceholder } from './heuristics.js'

export function extractFromBlocks(blocks) {
  const items = []
  let section = null
  let current = null

  const finish = () => {
    if (!current) return
    const text = clean(current.text)
    const strength = questionStrength(text)
    const keep =
      strength === 'strong' ||
      strength === 'medium' ||
      (strength === 'weak' && (current.identifier || current.list) && text.length >= 20 && !looksLikeHeading(text))
    if (keep) items.push({ identifier: current.identifier || null, question: text, section, strength, location: current.location })
    else if (looksLikeHeading(text)) section = text.replace(/:$/, '')
    current = null
  }

  for (const block of blocks) {
    const raw = clean(block.text)
    if (!raw) continue
    if (looksLikeAnswerPlaceholder(raw)) {
      finish()
      continue
    }
    const split = block.identifier ? { identifier: block.identifier, rest: raw } : splitNumbering(raw)
    const startsNew = Boolean(split.identifier) || block.list || block.heading
    const strength = questionStrength(split.rest)

    if (block.heading) {
      finish()
      section = split.rest.replace(/:$/, '')
      continue
    }

    // A wrapped continuation: the open item has not ended, and this line does not start anything.
    const openEnded = current && !/[?.:!]$/.test(current.text.trim())
    const continuation =
      current && !startsNew && openEnded && (/^[a-z(,;]/.test(split.rest) || strength === 'weak' || strength === null)
    if (continuation) {
      current.text += ' ' + split.rest
      continue
    }

    finish()
    if (!split.identifier && !block.list && looksLikeHeading(split.rest)) {
      section = split.rest.replace(/:$/, '')
      continue
    }
    if (startsNew || strength === 'strong' || strength === 'medium') {
      current = { identifier: split.identifier, text: split.rest, list: block.list, location: block.location }
    }
    // Anything else between questions is prose (instructions, existing answers) and is skipped.
  }
  finish()
  return items
}

/** Split pasted text into blocks; a single run-on paragraph is split on question marks. */
export function blocksFromText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    const parts = line.match(/[^?]+\?+|[^?]+$/g) || [line]
    if (parts.length > 1 && !splitNumbering(line).identifier) parts.forEach((p) => out.push({ text: p.trim() }))
    else out.push({ text: line })
  }
  return out
}
