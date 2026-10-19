// Match questions against the knowledge base. Exact and fuzzy matching run locally; for anything
// short of a sure match, viaSocket AI judges the best few candidates (no model key in this product).
import { all, getSetting, orgIdentifier } from './db.js'
import { normalize } from './extract/heuristics.js'
import { askAI, isConfigured } from './viasocket/client.js'
import { logError } from './plain.js'

const STOP = new Set(
  ('a an the of to in on for and or is are was were be been do does did you your yours we our us it its this that these those ' +
    'with by at as from any all have has had can could will would should shall may please there their they them what which how ' +
    'who when where why if not no yes so such than then also into about per').split(' ')
)

function stem(w) {
  return w
    .replace(/(ies)$/, 'y')
    .replace(/(ational|ation|ations)$/, 'ate')
    .replace(/(ing|edly|ed|es|ly|ment|ments)$/, '')
    .replace(/s$/, '')
}

export function tokens(text) {
  return normalize(text).split(' ').filter((w) => w && !STOP.has(w)).map(stem).filter((w) => w.length > 1)
}

function trigrams(text) {
  const s = `  ${normalize(text)} `
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

function dice(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const g of a) if (b.has(g)) inter++
  return (2 * inter) / (a.size + b.size)
}

/** Precompute what scoring needs for a set of KB entries. */
export function buildIndex(entries) {
  const docs = entries.map((e) => ({ entry: e, toks: tokens(e.question), grams: trigrams(e.question), norm: e.normalized || normalize(e.question) }))
  const df = new Map()
  for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) || 0) + 1)
  const N = Math.max(1, docs.length)
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0))) + 0.5
  for (const d of docs) {
    d.vec = new Map()
    for (const t of d.toks) d.vec.set(t, (d.vec.get(t) || 0) + idf(t))
    d.len = Math.sqrt([...d.vec.values()].reduce((s, v) => s + v * v, 0)) || 1
  }
  return { docs, idf }
}

/** Score 0–100 for each KB entry against one question; top candidates first. */
export function candidates(index, question, limit = 5) {
  const norm = normalize(question)
  const qt = tokens(question)
  const qv = new Map()
  for (const t of qt) qv.set(t, (qv.get(t) || 0) + index.idf(t))
  const qlen = Math.sqrt([...qv.values()].reduce((s, v) => s + v * v, 0)) || 1
  const qg = trigrams(question)
  const scored = index.docs.map((d) => {
    if (d.norm === norm) return { entry: d.entry, score: 100, method: 'exact' }
    let dot = 0
    for (const [t, w] of qv) if (d.vec.has(t)) dot += w * d.vec.get(t)
    const cosine = dot / (qlen * d.len)
    const chars = dice(qg, d.grams)
    const score = Math.round(100 * Math.min(0.99, 0.65 * cosine + 0.35 * chars))
    return { entry: d.entry, score, method: 'similar' }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function activeEntries() {
  return all('SELECT * FROM kb_entries WHERE archived = 0')
}

function thresholds() {
  return {
    autofill: Number(getSetting('autofill_threshold')) || 85,
    floor: Number(getSetting('review_floor')) || 45,
    useAI: getSetting('ai_matching') === '1' && isConfigured(),
    staleDays: getSetting('staleness_enabled') === '1' ? Number(getSetting('staleness_days')) || 90 : null
  }
}

export function classify(confidence, { autofill, floor }) {
  if (confidence >= autofill) return 'auto'
  if (confidence >= floor) return 'review'
  return 'not_found'
}

const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'integer' },
          best_candidate: { type: 'integer' },
          confidence: { type: 'integer' }
        },
        required: ['question', 'best_candidate', 'confidence']
      }
    }
  },
  required: ['results']
}

const AI_PROMPT = `You check whether an organization's approved knowledge-base answers answer questionnaire questions.
For each numbered question you get up to five candidates (a stored question and its approved answer).
Pick the candidate whose approved answer correctly and fully answers the question as asked. A related topic is not enough.
best_candidate is the candidate number, or -1 when none truly answers the question.
confidence (0-100): 90-100 the same question reworded; 70-89 answers it with small differences in scope; 40-69 uncertain, a person should check; below 40 probably not.
Judge only from the text given. Never invent answers.`

async function judgeWithAI(batch, jobKey) {
  const uid = orgIdentifier()
  const message = batch
    .map((b, qi) =>
      [`QUESTION ${qi}: ${b.question}`, ...b.cands.map((c, ci) => `  CANDIDATE ${ci}: Q: ${c.entry.question}\n    A: ${c.entry.answer.slice(0, 600)}`)].join('\n')
    )
    .join('\n\n')
  const content = await askAI(uid, {
    message,
    threadId: `match-${jobKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    prompt: AI_PROMPT,
    schema: AI_SCHEMA,
    schemaName: 'kb_match'
  })
  return content.results || []
}

/**
 * Match a list of { question } and return, per question, the suggestion and its classification.
 * jobKey keeps each AI judgement in its own thread so earlier questions never sway later ones.
 */
export async function matchQuestions(questions, jobKey = 'adhoc', onProgress = () => {}) {
  const t = thresholds()
  const entries = activeEntries()
  const index = buildIndex(entries)
  const results = questions.map((q) => {
    const cands = entries.length ? candidates(index, q.question) : []
    const top = cands[0]
    return { question: q.question, cands, best: top || null, confidence: top ? top.score : 0, method: top?.method || 'none' }
  })

  // Anything short of a sure local match, with some candidate to look at, goes to the AI.
  const unsure = results.filter((r) => r.cands.length && r.confidence < t.autofill && r.cands[0].score >= 8)
  if (t.useAI && unsure.length) {
    const chunks = []
    for (let i = 0; i < unsure.length; i += 8) chunks.push(unsure.slice(i, i + 8))
    let done = 0
    const runChunk = async (chunk) => {
      try {
        const verdicts = await judgeWithAI(chunk, jobKey)
        for (const v of verdicts) {
          const r = chunk[v.question]
          if (!r) continue
          if (v.best_candidate >= 0 && r.cands[v.best_candidate]) {
            r.best = r.cands[v.best_candidate]
            r.confidence = Math.max(0, Math.min(100, v.confidence))
            r.method = 'ai'
          } else {
            r.best = null
            r.confidence = Math.min(r.confidence, Math.max(0, Math.min(100, v.confidence)), t.floor - 1)
            r.method = 'ai-none'
          }
        }
      } catch (err) {
        // Fall back to the local scores for this chunk; matching still completes.
        logError('match.ai', err)
      }
      done += chunk.length
      onProgress(`Checking close matches… ${done} of ${unsure.length}`)
    }
    for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map(runChunk))
  }

  const staleBefore = t.staleDays ? Date.now() - t.staleDays * 86400000 : null
  return results.map((r) => {
    let classification = r.best ? classify(r.confidence, t) : 'not_found'
    let stale = false
    if (r.best && staleBefore && Date.parse(r.best.entry.last_verified) < staleBefore) {
      stale = true
      if (classification === 'auto') classification = 'review'
    }
    return {
      entry: classification === 'not_found' ? null : r.best?.entry || null,
      confidence: r.best ? r.confidence : 0,
      method: r.method,
      classification,
      stale
    }
  })
}
