// The one server-side module that talks to viaSocket. The signing secret, the embed token's
// signature and every script_id stay in this process; none of them is logged or sent to a browser.
import jwt from 'jsonwebtoken'
import { PlainError, MESSAGES } from '../plain.js'

const API = (process.env.VIASOCKET_API_URL || 'https://flow-api.viasocket.com/').replace(/\/$/, '')
const RUN_FUNC = (process.env.VIASOCKET_RUN_URL ? `${process.env.VIASOCKET_RUN_URL.replace(/\/$/, '')}/func/` : 'https://flow.sokt.io/func/')

export function isConfigured() {
  return Boolean(process.env.VIASOCKET_ORG_ID && process.env.VIASOCKET_PROJECT_ID && process.env.VIASOCKET_EMBED_SECRET)
}

/** HS256, three claims, no exp (valid until the secret rotates, by design). */
export function embedToken(uniqueIdentifier) {
  if (!isConfigured()) throw new PlainError('App connections are not set up on this server yet.', { status: 503 })
  return jwt.sign(
    {
      org_id: process.env.VIASOCKET_ORG_ID,
      project_id: process.env.VIASOCKET_PROJECT_ID,
      unique_identifier: uniqueIdentifier
    },
    process.env.VIASOCKET_EMBED_SECRET,
    { algorithm: 'HS256' }
  )
}

async function request(url, init, timeoutMs = 60000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    throw new PlainError(MESSAGES.appsUnreachable, { status: 502, detail: `network: ${err.name}` })
  }
}

async function call(path, uid, body, method = 'POST') {
  const res = await request(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: embedToken(uid) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  let payload
  try {
    payload = await res.json()
  } catch {
    throw new PlainError(MESSAGES.appsUnreachable, { status: 502, detail: `${path} answered ${res.status} without JSON` })
  }
  if (!res.ok || payload.success === false) {
    throw new PlainError(MESSAGES.appsUnreachable, { status: 502, detail: `${path} ${res.status}: ${payload.message || ''}` })
  }
  return payload.data
}

export async function listConnections(uid) {
  return (await call('/embed/authentications', uid, undefined, 'GET')) || []
}

export async function revokeConnection(uid, authId) {
  return call(`/embed/authentications/revoke/${encodeURIComponent(authId)}`, uid, undefined, 'DELETE')
}

export async function listUserFlows(uid) {
  const data = await call(`/projects/${process.env.VIASOCKET_PROJECT_ID}/integrations`, uid, undefined, 'GET')
  return data?.flows || []
}

export async function findEnabledApp(uid, serviceId) {
  const flows = await listUserFlows(uid)
  return flows.find((f) => f.service_id === serviceId && f.status === 'active')?.id || null
}

/** Once per (org, app): look up first, enable only if missing. Returns the script_id. */
export async function ensureEnabled(uid, serviceId, authId) {
  const existing = await findEnabledApp(uid, serviceId)
  if (existing) return existing
  const data = await call(`/embed/enable/${serviceId}/${encodeURIComponent(authId)}`, uid)
  return data.script_id
}

/** status 0 deletes a flow, 2 pauses it, 1 resumes it. */
export async function setFlowStatus(uid, scriptId, status) {
  return call(`/embed/updatestatus/${scriptId}?status=${status}`, uid, undefined, 'PUT')
}

/** Pick: the values one field accepts for this connection, as [{ label, value }]. */
export async function listOptions(uid, actionVersionId, fieldKey, existingFields, authId, appName = 'the app') {
  const data = await call(`/embed/list-options/${actionVersionId}`, uid, {
    fieldKey,
    auth_id: authId,
    existingFields: existingFields || {}
  })
  // A connection that cannot be read answers 200 with the failure nested inside.
  if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
    throw new PlainError(MESSAGES.appCantRead(appName), { status: 409, detail: data.response.data?.message })
  }
  const options = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return options
    .filter((o) => o && o.value !== undefined && o.value !== null)
    .map((o) => ({ label: String(o.label ?? o.value), value: o.value }))
}

/** Act: run one action on the org's enabled app. No token: the script_id is the credential. */
export async function runAction(scriptId, actionVersionId, inputData, appName = 'The app') {
  const res = await request(`${RUN_FUNC}${scriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_version_id: actionVersionId, inputData })
  }, 90000)
  let payload
  try {
    payload = await res.json()
  } catch {
    throw new PlainError(MESSAGES.appRejected(appName), { status: 502, detail: `run answered ${res.status} without JSON` })
  }
  const isEnvelope = payload && typeof payload === 'object' && typeof payload.success === 'boolean' && 'data' in payload
  if (isEnvelope ? !payload.success : payload?.success === false) {
    throw new PlainError(MESSAGES.appRejected(appName), {
      status: 502,
      detail: payload.message || payload.error?.message || 'action failed'
    })
  }
  return isEnvelope ? payload.data : payload
}

/** AI behind a feature: one call, a JSON answer in our own shape. No model key in this product. */
export async function askAI(uid, { message, threadId, prompt, schema, schemaName = 'answer' }) {
  const data = await call('/embed/ai/message', uid, {
    message,
    thread_id: threadId,
    prompt,
    response_type: 'json_schema',
    json_schema: { name: schemaName, schema, strict: true }
  })
  return typeof data.content === 'string' ? JSON.parse(data.content) : data.content
}
