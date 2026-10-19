// Connect (once, org-wide), Pick (destination and source pickers filled with the org's real data)
// and destinations for Act. The browser never receives the secret or a script_id.
import { Router } from 'express'
import { all, get, run, now, orgIdentifier } from '../db.js'
import { APPS, EVENTS, FILTERED_SERVICES, publicApp, setPath } from './apps.js'
import * as vs from './client.js'
import { getConnection } from './connections.js'
import { buildMessage, deliver } from '../events.js'
import { PlainError, MESSAGES } from '../plain.js'

export const router = Router()

function appOr404(key) {
  if (!APPS[key]) throw new PlainError(MESSAGES.notFound, { status: 404 })
  return APPS[key]
}

router.get('/integrations', async (req, res) => {
  const configured = vs.isConfigured()
  let live = null
  if (configured && all('SELECT app FROM connections').length) {
    try {
      live = await vs.listConnections(orgIdentifier())
    } catch {
      live = null // shown as "connected" from our records; the check is best-effort
    }
  }
  const apps = Object.keys(APPS).map((key) => {
    const conn = getConnection(key)
    const liveEntry = conn && live ? live.find((c) => c.id === conn.auth_id) : null
    return {
      ...publicApp(key),
      connected: Boolean(conn),
      connectedAt: conn?.connected_at || null,
      needsReconnect: Boolean(conn && live && (!liveEntry || liveEntry.isExpired)),
      // the auth_id is not a credential (the popup needs it to reconnect in place); the script_id never leaves the server
      authId: conn?.auth_id || null
    }
  })
  res.json({ configured, apps, events: EVENTS, filteredServices: FILTERED_SERVICES })
})

/** An embed token for the Connect popup only. Production: put this behind the product's login. */
router.get('/viasocket/token', (req, res) => {
  res.json({ token: vs.embedToken(orgIdentifier()) })
})

/** The popup reported success: confirm the connection is real, enable the app once, keep the script_id. */
router.post('/integrations/:app/connected', async (req, res) => {
  const app = appOr404(req.params.app)
  const authId = String(req.body?.authId || '')
  if (!authId) throw new PlainError(`We didn't get a confirmation from ${app.name}. Please try connecting again.`)
  const uid = orgIdentifier()
  const connections = await vs.listConnections(uid)
  const entry = connections.find((c) => c.id === authId)
  if (!entry || (entry.service_id && entry.service_id !== app.serviceId)) {
    throw new PlainError(`We couldn't confirm the ${app.name} connection. Please try connecting again.`, { detail: 'auth_id not found for org' })
  }
  const scriptId = await vs.ensureEnabled(uid, app.serviceId, authId)
  run(
    `INSERT INTO connections (app, service_id, auth_id, script_id, connected_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(app) DO UPDATE SET auth_id = excluded.auth_id, script_id = excluded.script_id, connected_at = excluded.connected_at`,
    req.params.app, app.serviceId, authId, scriptId, now()
  )
  res.json({ ok: true, message: `${app.name} is connected.` })
})

router.delete('/integrations/:app', async (req, res) => {
  const app = appOr404(req.params.app)
  const conn = getConnection(req.params.app)
  if (!conn) return res.json({ ok: true })
  const uid = orgIdentifier()
  // Turn off the enabled app first, then remove the connection itself.
  if (conn.script_id) await vs.setFlowStatus(uid, conn.script_id, 0).catch(() => {})
  await vs.revokeConnection(uid, conn.auth_id).catch(() => {})
  run('DELETE FROM connections WHERE app = ?', req.params.app)
  run('UPDATE destinations SET enabled = 0 WHERE app = ?', req.params.app)
  res.json({ ok: true, message: `${app.name} is disconnected. Notifications that used it are paused.` })
})

/** Pick: options for one picker, scoped by what is already chosen. */
router.get('/integrations/:app/options/:picker', async (req, res) => {
  const app = appOr404(req.params.app)
  const picker = app.pickers.find((p) => p.key === req.params.picker)
  if (!picker) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const conn = getConnection(req.params.app)
  if (!conn) throw new PlainError(MESSAGES.appNotConnected(app.name), { status: 409 })
  let values = {}
  try {
    values = JSON.parse(String(req.query.values || '{}'))
  } catch {
    values = {}
  }
  // existingFields is nested exactly like inputData, built from the field keys of what is chosen so far.
  const existing = structuredClone(picker.existingFields || {})
  const fieldKeyOf = (key) => app.pickers.find((p) => p.key === key)?.fieldKey || app.choices?.find((c) => c.key === key)?.fieldKey
  for (const dep of picker.dependsOn) {
    const value = values[dep]
    const fk = fieldKeyOf(dep)
    if (fk && value !== undefined && value !== null && value !== '') setPath(existing, fk, value)
  }
  if (picker.searchable && req.query.search) existing._searchText = String(req.query.search)
  const options = await vs.listOptions(orgIdentifier(), picker.versionId, picker.fieldKey, existing, conn.auth_id, app.name)
  res.json({ options })
})

// ---------- destinations (where Act sends messages) ----------

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

function validateDestination(appKey, config, events) {
  const app = appOr404(appKey)
  if (!app.send) throw new PlainError(`${app.name} can't receive messages.`)
  if (!Array.isArray(events) || !events.length || events.some((e) => !EVENTS[e])) throw new PlainError('Choose at least one kind of update to send.')
  if (appKey === 'slack' && !config.channels?.length) throw new PlainError('Choose a Slack channel.')
  if (appKey === 'teams' && (!config.team?.value || !config.channel?.value)) throw new PlainError('Choose a team and a channel.')
  if (appKey === 'gmail' || appKey === 'outlook') {
    const list = String(config.to || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!list.length || list.some((e) => !EMAIL_RE.test(e))) throw new PlainError('Enter one or more email addresses, separated by commas.')
    config.to = list.join(', ')
  }
  return app
}

function labelFor(appKey, config) {
  if (appKey === 'slack') return config.channels.map((c) => (String(c.label).startsWith('#') ? c.label : `#${c.label}`)).join(', ')
  if (appKey === 'teams') return `${config.team.label} › ${config.channel.label}`
  return config.to
}

router.get('/destinations', (req, res) => {
  const rows = all('SELECT * FROM destinations ORDER BY created_at').map((d) => ({
    ...d,
    config: JSON.parse(d.config),
    events: JSON.parse(d.events),
    enabled: Boolean(d.enabled),
    appName: APPS[d.app]?.name,
    icon: APPS[d.app]?.icon
  }))
  res.json({ destinations: rows })
})

router.post('/destinations', (req, res) => {
  const { app: appKey, config = {}, events } = req.body || {}
  validateDestination(appKey, config, events)
  if (!getConnection(appKey)) throw new PlainError(MESSAGES.appNotConnected(APPS[appKey].name), { status: 409 })
  const info = run(
    'INSERT INTO destinations (app, label, config, events, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    appKey, labelFor(appKey, config), JSON.stringify(config), JSON.stringify(events), now()
  )
  res.json({ id: Number(info.lastInsertRowid) })
})

router.put('/destinations/:id', (req, res) => {
  const d = get('SELECT * FROM destinations WHERE id = ?', req.params.id)
  if (!d) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const events = req.body.events ?? JSON.parse(d.events)
  const config = req.body.config ?? JSON.parse(d.config)
  validateDestination(d.app, config, events)
  const enabled = req.body.enabled === undefined ? d.enabled : req.body.enabled ? 1 : 0
  if (enabled && !getConnection(d.app)) throw new PlainError(MESSAGES.appNotConnected(APPS[d.app].name), { status: 409 })
  run('UPDATE destinations SET label = ?, config = ?, events = ?, enabled = ? WHERE id = ?', labelFor(d.app, config), JSON.stringify(config), JSON.stringify(events), enabled, d.id)
  res.json({ ok: true })
})

router.delete('/destinations/:id', (req, res) => {
  run('DELETE FROM destinations WHERE id = ?', req.params.id)
  res.json({ ok: true })
})

router.post('/destinations/:id/test', async (req, res) => {
  const d = get('SELECT * FROM destinations WHERE id = ?', req.params.id)
  if (!d) throw new PlainError(MESSAGES.notFound, { status: 404 })
  const result = await deliver(d, buildMessage('test', { title: 'QuestionnaireFlow test message' }))
  if (!result.ok) throw new PlainError(result.message, { status: 502 })
  res.json({ ok: true, message: `Test message sent to ${d.label}.` })
})

router.get('/activity', (req, res) => {
  const rows = all('SELECT * FROM event_log ORDER BY id DESC LIMIT 50').map((e) => ({ ...e, deliveries: JSON.parse(e.deliveries), label: EVENTS[e.event] }))
  res.json({ activity: rows })
})
