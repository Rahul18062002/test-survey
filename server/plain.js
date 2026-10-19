// Every message a user can see goes through here. Technical detail is logged on the server
// (never with secrets) and replaced with a plain sentence that says what to do next.

export class PlainError extends Error {
  constructor(message, { status = 400, detail } = {}) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

export const MESSAGES = {
  generic: 'Something went wrong on our side. Please try again — your work so far is saved.',
  notFound: "We couldn't find that. It may have been removed.",
  appsUnreachable: "We couldn't reach your connected apps just now. Please try again in a minute.",
  appNotConnected: (app) => `${app} isn't connected yet. Connect it in Settings first.`,
  appCantRead: (app) =>
    `We couldn't read your ${app} account. The connection may have expired — reconnect ${app} in Settings and try again.`,
  appRejected: (app) =>
    `${app} didn't accept the request. Check that the destination still exists and that the connected account can use it.`,
  fileUnreadable:
    "We couldn't read this file. Make sure it isn't password-protected or damaged, then try again. You can also paste the questions instead.",
  fileType: 'Please upload a PDF, Word (.docx), Excel (.xlsx) or CSV file.',
  fileTooBig: 'That file is larger than 25 MB. Try splitting it, or paste the questions instead.',
  noQuestions:
    "We couldn't spot any questions in this file. You can add them yourself on the next screen, or paste them instead.",
  ocrUnavailable:
    "This looks like a scanned document, and we couldn't read the text from the images. Try a PDF with selectable text, or paste the questions.",
  locked: (name) => `${name || 'Someone'} is working on this question right now. Try another one, or check back in a few minutes.`
}

/** Translate anything thrown into { status, message } that is safe to show. */
export function toPlain(err) {
  if (err instanceof PlainError) return { status: err.status, message: err.message }
  if (err?.code === 'LIMIT_FILE_SIZE') return { status: 413, message: MESSAGES.fileTooBig }
  if (err?.type === 'entity.too.large') return { status: 413, message: MESSAGES.fileTooBig }
  return { status: 500, message: MESSAGES.generic }
}

export function logError(context, err) {
  // Only the message and our own detail; never request bodies, tokens or headers.
  const detail = err?.detail ? ` (${typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail).slice(0, 300)})` : ''
  console.error(`[${context}] ${err?.message || err}${detail}`)
}
