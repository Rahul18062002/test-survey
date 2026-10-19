import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { router as api } from './api.js'
import { router as viasocket } from './viasocket/routes.js'
import { toPlain, logError } from './plain.js'
import { isConfigured } from './viasocket/client.js'

const app = express()
app.disable('x-powered-by')

// Optional shared password for a hosted copy (there is no login in this version). When APP_PASSWORD
// is set, the browser asks for it once; any user name works.
const PASSWORD = process.env.APP_PASSWORD
if (PASSWORD) {
  const want = crypto.createHash('sha256').update(PASSWORD).digest()
  app.use((req, res, next) => {
    const [scheme, encoded] = String(req.headers.authorization || '').split(' ')
    const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : ''
    if (crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), want)) return next()
    res.set('WWW-Authenticate', 'Basic realm="QuestionnaireFlow", charset="UTF-8"')
    res.status(401).send('Please enter the QuestionnaireFlow password.')
  })
}

app.use(express.json({ limit: '2mb' }))

app.use('/api', api)
app.use('/api', viasocket)
app.use('/api', (req, res) => res.status(404).json({ error: "We couldn't find that." }))

// The built client, when running in production mode.
const dist = path.resolve('dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Every error leaves as a plain sentence; the technical detail stays in the server log.
app.use((err, req, res, _next) => {
  const { status, message } = toPlain(err)
  if (status >= 500 || err?.detail) logError(`${req.method} ${req.path}`, err)
  res.status(status).json({ error: message })
})

const port = Number(process.env.PORT) || 3001
app.listen(port, '0.0.0.0', () => {
  console.log(`QuestionnaireFlow API on http://localhost:${port}${PASSWORD ? ' (password required)' : ''}`)
  if (!isConfigured()) console.log('App connections are off: VIASOCKET_ORG_ID / VIASOCKET_PROJECT_ID / VIASOCKET_EMBED_SECRET are not all set.')
})
