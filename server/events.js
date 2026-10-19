// Internal events. The product decides when they fire; each enabled destination subscribed to the
// event gets a message through viaSocket (Act on the org's enabled app). Delivery never blocks the
// user's work, and the outcome is kept in a plain-language activity log.
import { all, run, now } from './db.js'
import { EVENTS, APPS } from './viasocket/apps.js'
import { sendToDestination } from './viasocket/connections.js'
import { logError, toPlain } from './plain.js'

const BASE = () => (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Build the same message as Slack markdown, plain text and email/Teams HTML. */
export function buildMessage(event, p) {
  const link = p.jobId ? `${BASE()}/jobs/${p.jobId}` : BASE()
  const list = (p.questions || []).slice(0, 10)
  const more = (p.questions?.length || 0) - list.length
  let subject
  let lines
  if (event === 'questionnaire.completed') {
    subject = `Questionnaire finished: ${p.title}`
    lines = [`*${p.title}* is finished.`, `${p.total} answers — ${p.auto} filled automatically, ${p.reviewed} checked by a person${p.blank ? `, ${p.blank} left blank` : ''}.`]
  } else if (event === 'review.pending') {
    subject = `${p.count} answer${p.count === 1 ? '' : 's'} waiting for review: ${p.title}`
    lines = [`*${p.title}* has ${p.count} suggested answer${p.count === 1 ? '' : 's'} waiting for a quick review.`]
  } else if (event === 'answer.not_found') {
    subject = `${p.count} unanswered question${p.count === 1 ? '' : 's'}: ${p.title}`
    lines = [`*${p.title}* has ${p.count} question${p.count === 1 ? '' : 's'} the knowledge base couldn't answer:`, ...list.map((q) => `• ${q}`), ...(more > 0 ? [`…and ${more} more`] : [])]
  } else {
    subject = p.title || 'Test message'
    lines = [p.text || 'This is a test message from QuestionnaireFlow. Notifications will arrive here.']
  }
  const linkLine = event === 'test' ? null : `Open it: ${link}`
  const text = [...lines, ...(linkLine ? ['', linkLine] : [])].join('\n')
  const html =
    lines.map((l) => `<p>${esc(l).replace(/\*(.+?)\*/g, '<b>$1</b>')}</p>`).join('') +
    (linkLine ? `<p><a href="${esc(link)}">Open in QuestionnaireFlow</a></p>` : '')
  return { subject, text, html }
}

export async function deliver(dest, message) {
  try {
    const response = await sendToDestination(dest, message)
    return { destination: dest.label, app: APPS[dest.app].name, ok: true, response }
  } catch (err) {
    logError(`deliver ${dest.app}`, err)
    return { destination: dest.label, app: APPS[dest.app].name, ok: false, message: toPlain(err).message }
  }
}

export async function emit(event, payload) {
  if (!EVENTS[event]) throw new Error(`unknown event ${event}`)
  const message = buildMessage(event, payload)
  const targets = all('SELECT * FROM destinations WHERE enabled = 1').filter((d) => JSON.parse(d.events).includes(event))
  const info = run('INSERT INTO event_log (event, summary, created_at) VALUES (?, ?, ?)', event, message.subject, now())
  const deliveries = await Promise.all(targets.map((d) => deliver(d, message)))
  const stored = deliveries.map(({ response: _r, ...rest }) => rest)
  run('UPDATE event_log SET deliveries = ? WHERE id = ?', JSON.stringify(stored), info.lastInsertRowid)
  return stored
}

/** Fire and forget from request handlers: failures are logged, never shown as a crash. */
export function emitLater(event, payload) {
  emit(event, payload).catch((err) => logError(`emit ${event}`, err))
}
