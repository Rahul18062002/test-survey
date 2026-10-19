// Shared signals for "is this a question?", "is this numbering?" and "is this a heading?".
// Generic on purpose: no company's column names or phrasing is assumed.

const INTERROGATIVE = new Set(
  'do does did is are was were can could have has had will would should shall may might what how who when where which why whom whose'.split(' ')
)
const IMPERATIVE = new Set(
  ('describe provide list explain state confirm indicate specify detail outline identify attach include submit share ' +
    'summarize summarise document demonstrate define please give upload name enter clarify elaborate supply ' +
    'report disclose discuss select rate')
    .split(' ')
)
const INSTRUCTION_RE = /\b(the following questions|this questionnaire|answer (all|each|every|the following)|instructions?|thank you for)\b/i

export function clean(text) {
  return String(text ?? '')
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** For matching and analytics: lower case, no numbering, no punctuation. */
export function normalize(text) {
  const { rest } = splitNumbering(clean(text))
  return rest
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Q1.", "Question 3:", "1.", "1)", "1.2.3", "(a)", "a)", "iv.", "A1.", "SEC-01:"
const NUMBERING_RE = new RegExp(
  '^\\s*(' +
    '(?:Q(?:uestion)?\\s*#?\\s*\\d+(?:\\.\\d+)*[a-z]?)\\s*[\\.\\):\\-–]?' +
    '|\\(?(?:\\d+(?:\\.\\d+)*[a-z]?|[A-Za-z]|[ivxlcIVXLC]{1,6}|[A-Z]{1,4}[\\-\\.]?\\d+(?:\\.\\d+)*)[\\.\\):]' +
    '|\\d+(?:\\.\\d+)+' +
    ')\\s+(?=\\S)'
)

export function splitNumbering(text) {
  const m = String(text).match(NUMBERING_RE)
  if (!m) return { identifier: null, rest: String(text).trim() }
  const raw = m[1].trim()
  const identifier = raw.replace(/^\(/, '').replace(/[\.\):\-–]+$/, '').replace(/^question\s*/i, 'Q').trim()
  return { identifier, rest: String(text).slice(m[0].length).trim() }
}

function firstWord(text) {
  return (text.match(/^[^A-Za-z]*([A-Za-z]+)/)?.[1] || '').toLowerCase()
}

/**
 * strength: 'strong' (ends with ?), 'medium' (imperative or interrogative opening), 'weak', or null.
 */
export function questionStrength(text) {
  const t = clean(text)
  if (t.length < 8 || t.length > 1500) return null
  if (/^[_\-\s.]+$/.test(t)) return null
  if (/\?\s*(\(.*\))?\s*$/.test(t) || /\?["”)]?\s*$/.test(t)) return 'strong'
  if (INSTRUCTION_RE.test(t)) return null
  const w = firstWord(t)
  if (IMPERATIVE.has(w) || INTERROGATIVE.has(w)) return 'medium'
  return 'weak'
}

/** A section heading: short, no question signal, no sentence punctuation at the end. */
export function looksLikeHeading(text) {
  const t = clean(text)
  if (!t || t.length > 70) return false
  if (questionStrength(t) === 'strong' || questionStrength(t) === 'medium') return false
  if (/[.;,]$/.test(t)) return false
  const words = t.split(' ')
  if (words.length > 9) return false
  const capitalised = words.filter((w) => /^[A-Z0-9&]/.test(w)).length / words.length
  return t === t.toUpperCase() || capitalised >= 0.6 || t.endsWith(':')
}

export function looksLikeAnswerPlaceholder(text) {
  const t = clean(text)
  return /^(answer|response|reply|your (answer|response))\s*[:\-]/i.test(t) || /^[_\s.]{4,}$/.test(t) || /^\[.*\]$/.test(t)
}

export function looksLikeIdentifier(text) {
  const t = clean(text)
  return t.length > 0 && t.length <= 14 && /^(?:[A-Za-z]{0,5}[\-\s.]?)?\d+(?:[.\-]\d+)*[a-z]?\.?$|^[A-Za-z]\.?$|^[ivxlc]{1,6}\.?$/i.test(t)
}

/** Score a set of extracted items 0–100: how sure are we this is the right list of questions? */
export function detectionConfidence(items, { penalty = 0 } = {}) {
  if (!items.length) return 0
  let score = 0
  for (const it of items) score += it.strength === 'strong' ? 1 : it.strength === 'medium' ? 0.85 : it.fromTable ? 0.8 : 0.45
  let pct = (score / items.length) * 100
  if (items.length < 2) pct = Math.min(pct, 75)
  return Math.max(0, Math.round(pct - penalty))
}
