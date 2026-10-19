# QuestionnaireFlow

Answer any questionnaire — or a single typed question — from your organization's own approved knowledge
base. Anything uncertain goes to a person for a one-click review, and you get a completed file in any format.
App connections (Google Sheets, Excel, Gmail, Outlook, Slack, Microsoft Teams) go through viaSocket Embed, so
the product never stores a third-party credential.

## Run it

```bash
cp .env.example .env        # fill in the three VIASOCKET_* values
npm install
npm run dev                 # API on :3001, app on http://localhost:5173
# or: npm run build && npm start   → everything on http://localhost:3001
npm test                    # product tests + viaSocket id check against the live catalog
```

Node 22.13+ (uses the built-in `node:sqlite`). Scanned PDFs need `pdftoppm` (poppler-utils) on the server;
text recognition itself runs in-process with tesseract.js and bundled English data.

## How it works

```
Input (PDF / DOCX / XLSX / CSV / paste / one question / connected sheet)
  → Extract: questions + their original numbering, sections and cell positions   server/extract/
  → Confirm: only when detection confidence < 80% ("We found 42 questions — does this look right?")
  → Match: exact + fuzzy locally; viaSocket AI judges the close calls             server/match.js
  → Classify by the org's threshold: filled automatically / needs review / not found
  → Review: "Looks good" / "Fix it"; corrections offered to the knowledge base   server/jobs.js
  → Output: a new PDF / DOCX / XLSX / CSV — the original is never modified        server/output.js
  → Events: questionnaire.completed, review.pending, answer.not_found → viaSocket Act   server/events.js
```

- **Knowledge base** (`server/kb.js`) is the single source of truth. Every entry has question, answer, source
  (sheet + row, "Manually added by … on …", "Approved from review on …"), confidence and last-verified date.
  Close matches are flagged as possible duplicates; optional staleness flagging (off by default).
- **No login** in this version (demo). Review locks use a per-browser id and an optional display name.
- All user-facing text is plain language; technical detail is logged server-side only (`server/plain.js`).

## viaSocket integration

All of it is in `server/viasocket/` plus `client/src/components/viasocket.jsx`. Connect, Pick and Act are
called directly through the API (no prebuilt UI). Only the six apps in `server/viasocket/apps.js` are offered
(`FILTERED_SERVICES`).

- **Who connects:** an org admin, once, in Settings. One stable `unique_identifier` per organization
  (`org-<uuid>`, generated on first run). The `auth_id` and the enabled app's `script_id` are stored
  server-side; the `script_id` never reaches the browser. Expired connections show **Reconnect**, which
  reopens the popup with the same `auth_id`.
- **Who picks the action:** the product, in code. Read rows for sheets; send a message for email/chat,
  fired by internal events. Users never choose an action.

| App · action | Value | Source |
| --- | --- | --- |
| Google Sheets · List Rows in Sheet | `spreadSheet_id`, `sheet_id` | user, picker (spreadsheet search, then tab) |
| | `column_key` | code: `false` — we read raw rows and detect the header ourselves, the same for every user |
| | `sorting_limit.*` | omitted: read all rows |
| Excel · Find Row | `storage` | user: OneDrive / SharePoint (depends on where their file is) |
| | `folder` (optional), `sheet`, `worksheet`, `table` | user, pickers |
| | `column`, `value` | omitted: no filter, so the whole table is read |
| Slack · Send Message | `destination.messageto` | code: `"channel"` |
| | `destination.channel_id` | user, multi-select picker |
| | `markdown_content` | code: built per event |
| | `bot_details.bot_name` | code: "QuestionnaireFlow" |
| | `tagged_users`, `reply_broadcast`, `buttons`, `schedule_type`/`delay_value`/`post_at`, `bot_details.icon_type`/`emoji`/`url`, `preview.*` | omitted: no one to tag generically; not a thread; link is in the text; send now; default icon and previews |
| Teams · Send Channel Message | `team_id`, `channel_id` | user, pickers (channel after team) |
| | `message_format` | code: `"html"` |
| | `message` | code: built per event |
| Gmail · Send Email | `to` | user, typed recipients (the field is free text in the connector; validated as email addresses) |
| | `from` | user, optional picker of their send-as addresses |
| | `subject`, `messageBody` | code: per event; `fromName` = "QuestionnaireFlow" |
| | `cc`, `bcc`, `replyTo`, `attachments`, `labelIds` | omitted: not needed for notifications |
| Outlook · Send Email | `to_recipients` | user, typed recipients |
| | `subject`, `body` | code: per event |
| | `importance`, `add_custom_headers` | code: `"Normal"`, `false`; `cc`/`bcc`/`custom_headers` omitted |

AI matching uses viaSocket's AI-in-the-product endpoint with a JSON schema (no model key in this product), on
a fresh thread per batch so earlier questions never sway later ones.

Check and prove:

```bash
node scripts/viasocket-check.mjs server client          # ids and URLs vs the live catalog
npm run prove:viasocket -- status                        # real calls on a viaSocket *test* connection
npm run prove:viasocket -- options slack channels
npm run prove:viasocket -- send slack '{"channels":[{"value":"C…","label":"test"}]}'
```

For production, put `GET /api/viasocket/token` (and the rest of the API) behind your login.
