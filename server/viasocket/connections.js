// Org-wide app connections (one per app, made once in Settings) and the reads/sends that use them.
import { get } from '../db.js'
import { APPS } from './apps.js'
import { runAction } from './client.js'
import { PlainError, MESSAGES } from '../plain.js'

export function getConnection(appKey) {
  return get('SELECT * FROM connections WHERE app = ?', appKey) || null
}

function requireConnection(appKey) {
  const conn = getConnection(appKey)
  if (!conn || !conn.script_id) throw new PlainError(MESSAGES.appNotConnected(APPS[appKey].name), { status: 409 })
  return conn
}

/**
 * Read every row of a connected spreadsheet as string[][], in sheet order.
 * config holds what the user picked: { spreadsheet, sheet } or { storage, folder, sheet, worksheet, table },
 * each { value, label }. `conn` defaults to the org's stored connection.
 */
export async function readSheetRows(appKey, config, conn = requireConnection(appKey)) {
  const app = APPS[appKey]
  const v = (k) => config?.[k]?.value
  let inputData
  if (appKey === 'google_sheets') {
    inputData = {
      spreadSheet_id: v('spreadsheet'),
      sheet_id: v('sheet'),
      // Fixed for every user: we read raw rows and find the header row ourselves, the same
      // auto-detection used for uploads, so nobody is asked how their sheet is laid out.
      column_key: false
      // sorting_limit omitted: all rows, from the top.
    }
  } else if (appKey === 'excel') {
    inputData = {
      storage: v('storage'),
      ...(v('storage') === 'onedrive' && v('folder') ? { folder: v('folder') } : {}),
      sheet: v('sheet'),
      worksheet: v('worksheet'),
      table: v('table')
      // column / value omitted: no filter, so the whole table is asked for.
    }
  } else {
    throw new PlainError('That app cannot be used as an answer source.')
  }
  const data = await runAction(conn.script_id, app.read.actionVersionId, inputData, app.name)
  return toRows(data)
}

const LETTERS = /^[A-Z]{1,3}$/
const ROW_KEYS = new Set(['_rowNumber', 'Row Number', 'rowNumber', 'row_number'])

function letterIndex(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Normalise the shapes a spreadsheet read can come back in to string[][]. */
export function toRows(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.values)
          ? data.values
          : Array.isArray(data?.value)
            ? data.value
            : []
  if (!list.length) return []
  const str = (x) => (x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))
  if (list.every((r) => Array.isArray(r))) return list.map((r) => r.map(str))
  if (list.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    // Graph-style table rows: { values: [[...]] }
    if (list.every((r) => Array.isArray(r.values))) return list.map((r) => (Array.isArray(r.values[0]) ? r.values[0] : r.values).map(str))
    const keys = [...new Set(list.flatMap((r) => Object.keys(r)))].filter((k) => !ROW_KEYS.has(k))
    if (keys.length && keys.every((k) => LETTERS.test(k))) {
      const rows = []
      list.forEach((r, i) => {
        const at = Number(r._rowNumber ?? r['Row Number'] ?? i + 1) - 1
        const row = []
        for (const k of keys) row[letterIndex(k)] = str(r[k])
        rows[at] = Array.from(row, (x) => x ?? '')
      })
      return Array.from(rows, (r) => r || [])
    }
    return [keys, ...list.map((r) => keys.map((k) => str(r[k])))]
  }
  return [list.map(str)]
}

/** Send one message to a destination. Returns the app's response. */
export async function sendToDestination(dest, { subject, text, html }, conn = requireConnection(dest.app)) {
  const app = APPS[dest.app]
  const cfg = typeof dest.config === 'string' ? JSON.parse(dest.config) : dest.config
  let inputData
  switch (dest.app) {
    case 'slack':
      inputData = {
        destination: {
          messageto: 'channel', // fixed: the product posts to channels the org picked
          channel_id: (cfg.channels || []).map((c) => c.value)
        },
        markdown_content: text,
        bot_details: { bot_name: 'QuestionnaireFlow' }
      }
      break
    case 'teams':
      inputData = { team_id: cfg.team?.value, channel_id: cfg.channel?.value, message_format: 'html', message: html }
      break
    case 'gmail':
      inputData = {
        to: cfg.to,
        subject,
        messageBody: html,
        fromName: 'QuestionnaireFlow',
        ...(cfg.from?.value ? { from: cfg.from.value } : {})
      }
      break
    case 'outlook':
      inputData = { to_recipients: cfg.to, subject, body: html, importance: 'Normal', add_custom_headers: false }
      break
    default:
      throw new PlainError('That app cannot receive messages.')
  }
  return runAction(conn.script_id, app.send.actionVersionId, inputData, app.name)
}
