// Prove the integration with real calls on a viaSocket *test* connection, through the product's own
// modules (same list-options, enable, run and message code the app uses). Test ids are read live and
// printed only in shortened form; nothing is stored. The product's users connect through Settings.
//
//   npm run prove:viasocket -- status
//   npm run prove:viasocket -- options <app> <picker> ['{"dep":"value"}']
//   npm run prove:viasocket -- read <google_sheets|excel> '<config json>'
//   npm run prove:viasocket -- send <slack|teams|gmail|outlook> '<config json>'
//   npm run prove:viasocket -- ai
import * as vs from '../server/viasocket/client.js'
import { APPS, setPath } from '../server/viasocket/apps.js'
import { readSheetRows, sendToDestination } from '../server/viasocket/connections.js'
import { buildMessage } from '../server/events.js'

const TEST_USER = process.env.VIASOCKET_TEST_USER || 'apps-api-test-user'
const [cmd, appKey, a, b] = process.argv.slice(2)
const short = (id) => (id ? `${String(id).slice(0, 8)}…` : id)

async function testConnection(key) {
  const app = APPS[key]
  if (!app) throw new Error(`unknown app ${key}`)
  const list = await vs.listConnections(TEST_USER)
  const entry = list.find((c) => String(c.id).endsWith(`_${app.serviceId}`))
  if (!entry) throw new Error(`No test connection for ${app.name}. Connect it on the apps-api page first.`)
  const scriptId = await vs.ensureEnabled(TEST_USER, app.serviceId, entry.id)
  return { app, conn: { auth_id: entry.id, script_id: scriptId } }
}

async function main() {
  if (cmd === 'status') {
    const list = await vs.listConnections(TEST_USER)
    const flows = await vs.listUserFlows(TEST_USER)
    for (const [key, app] of Object.entries(APPS)) {
      const c = list.find((x) => String(x.id).endsWith(`_${app.serviceId}`))
      const f = flows.find((x) => x.service_id === app.serviceId && x.status === 'active')
      console.log(`${app.name.padEnd(18)} ${c ? `connected (auth ${short(c.id)}${c.isExpired ? ', EXPIRED' : ''})` : 'not connected'}${f ? `, enabled (script ${short(f.id)})` : ''}  [${key}]`)
    }
  } else if (cmd === 'options') {
    const { app, conn } = await testConnection(appKey)
    const picker = app.pickers.find((p) => p.key === a)
    const values = b ? JSON.parse(b) : {}
    const existing = structuredClone(picker.existingFields || {})
    for (const dep of picker.dependsOn) {
      const fk = app.pickers.find((p) => p.key === dep)?.fieldKey || app.choices?.find((c) => c.key === dep)?.fieldKey
      if (values[dep]) setPath(existing, fk, values[dep])
    }
    const options = await vs.listOptions(TEST_USER, picker.versionId, picker.fieldKey, existing, conn.auth_id, app.name)
    console.log(`${app.name} › ${picker.label}: ${options.length} options`)
    for (const o of options.slice(0, 25)) console.log(`  ${JSON.stringify(o.value)}  ${o.label}`)
  } else if (cmd === 'read') {
    const { conn } = await testConnection(appKey)
    const rows = await readSheetRows(appKey, JSON.parse(a), conn)
    console.log(`${rows.length} rows read. First 5:`)
    for (const r of rows.slice(0, 5)) console.log('  ', JSON.stringify(r))
  } else if (cmd === 'send') {
    const { conn } = await testConnection(appKey)
    const msg = buildMessage('test', { title: 'QuestionnaireFlow test message' })
    const res = await sendToDestination({ app: appKey, config: JSON.parse(a) }, msg, conn)
    console.log('Response:', JSON.stringify(res, null, 2).slice(0, 2000))
  } else if (cmd === 'ai') {
    const out = await vs.askAI(TEST_USER, {
      message: 'QUESTION 0: Do you keep backups?\n  CANDIDATE 0: Q: How long are backups retained?\n    A: Daily, kept 35 days.',
      threadId: `prove-${Date.now()}`,
      prompt: 'Return best_candidate and confidence for each question.',
      schema: { type: 'object', additionalProperties: false, properties: { best_candidate: { type: 'integer' }, confidence: { type: 'integer' } }, required: ['best_candidate', 'confidence'] }
    })
    console.log('AI response:', JSON.stringify(out))
  } else {
    console.log('usage: status | options <app> <picker> [values] | read <app> <config> | send <app> <config> | ai')
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message, err.detail ? `(${typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)})` : '')
  process.exit(1)
})
