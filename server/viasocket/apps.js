// The only viaSocket apps this product offers (its `filteredServices`). Every id and field key below
// is copied from that app's viaSocket document, fetched for this build — never typed from a label.
// Two ids per action: `actionVersionId` runs the action and lists options; `actionId` goes to the
// Connect popup's `filteredActions` so the consent screen asks only for the scopes we use.

export const EVENTS = {
  'questionnaire.completed': 'A questionnaire is finished',
  'review.pending': 'Answers are waiting for review',
  'answer.not_found': "A question couldn't be answered from the knowledge base"
}

export const APPS = {
  google_sheets: {
    serviceId: 'rowqm5xi2',
    name: 'Google Sheets',
    icon: 'https://stuff.thingsofbrand.com/google.com/images/img4_googlesheet.png',
    category: 'source',
    stack: 'google',
    blurb: 'Read your approved answers from a Google Sheet. We only read it — it is never changed.',
    // "List Rows in Sheet"
    read: { actionVersionId: 'rowyu1mevdtq', actionId: 'rowlpijbo5k1' },
    pickers: [
      {
        key: 'spreadsheet',
        label: 'Spreadsheet',
        hint: 'The spreadsheet that holds your questions and answers.',
        versionId: 'rowyu1mevdtq',
        fieldKey: 'spreadSheet_id',
        searchable: true,
        dependsOn: []
      },
      {
        key: 'sheet',
        label: 'Tab',
        hint: 'The tab inside that spreadsheet.',
        versionId: 'rowyu1mevdtq',
        fieldKey: 'sheet_id',
        dependsOn: ['spreadsheet']
      }
    ]
  },
  excel: {
    serviceId: 'rowln4ipb8r6',
    name: 'Microsoft Excel',
    icon: 'https://stuff.thingsofbrand.com/microsoft.com/images/img1_excel.jpeg',
    category: 'source',
    stack: 'microsoft',
    blurb: 'Read your approved answers from an Excel table in OneDrive or SharePoint. We only read it.',
    // "Find Row" — the connector's only read action; with no search value it is asked for the table's rows.
    read: { actionVersionId: 'rowgn9bldvgu', actionId: 'rows1wzf73ma' },
    // `storage` is "one of onedrive | sharepoint" with no default: where the user's file lives, so the user picks.
    choices: [
      {
        key: 'storage',
        fieldKey: 'storage',
        label: 'Where is the file?',
        options: [
          { label: 'OneDrive', value: 'onedrive' },
          { label: 'SharePoint', value: 'sharepoint' }
        ]
      }
    ],
    pickers: [
      {
        key: 'folder',
        label: 'Folder (optional)',
        hint: 'Leave empty to look in the top folder of your OneDrive.',
        versionId: 'rowgn9bldvgu',
        fieldKey: 'folder',
        optional: true,
        dependsOn: ['storage'],
        onlyWhen: { storage: 'onedrive' }
      },
      {
        key: 'sheet',
        label: 'Workbook',
        hint: 'The Excel file that holds your questions and answers.',
        versionId: 'rowgn9bldvgu',
        fieldKey: 'sheet',
        dependsOn: ['storage', 'folder']
      },
      {
        key: 'worksheet',
        label: 'Worksheet',
        hint: 'The tab inside that workbook.',
        versionId: 'rowgn9bldvgu',
        fieldKey: 'worksheet',
        dependsOn: ['storage', 'folder', 'sheet']
      },
      {
        key: 'table',
        label: 'Table',
        hint: 'The Excel table with your questions and answers.',
        versionId: 'rowgn9bldvgu',
        fieldKey: 'table',
        dependsOn: ['storage', 'folder', 'sheet', 'worksheet']
      }
    ]
  },
  gmail: {
    serviceId: 'rowo0bqrhj5g',
    name: 'Gmail',
    icon: 'https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg',
    category: 'email',
    stack: 'google',
    blurb: 'Send email updates from your Gmail account.',
    // "Send Email"
    send: { actionVersionId: 'rowwj0sfmhub', actionId: 'rowogelpy0h6' },
    pickers: [
      {
        key: 'from',
        label: 'Send from (optional)',
        hint: 'One of your Gmail addresses. Leave empty to use the main one.',
        versionId: 'rowwj0sfmhub',
        fieldKey: 'from',
        optional: true,
        dependsOn: []
      }
    ]
  },
  outlook: {
    serviceId: 'rowtuwzc2a57',
    name: 'Microsoft Outlook',
    icon: 'https://stuff.thingsofbrand.com/microsoft.com/images/img9_Microsoft_Office_Outlook.png',
    category: 'email',
    stack: 'microsoft',
    blurb: 'Send email updates from your Outlook account.',
    // "Send Email"
    send: { actionVersionId: 'row3c336jmyx', actionId: 'row5ok7mvcs9' },
    pickers: []
  },
  slack: {
    serviceId: 'rowbu58rc',
    name: 'Slack',
    icon: 'https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg',
    category: 'messaging',
    stack: 'google',
    blurb: 'Post updates to a Slack channel.',
    // "Send Message"
    send: { actionVersionId: 'rowj2u3wc8h5', actionId: 'row1jrbor' },
    pickers: [
      {
        key: 'channels',
        label: 'Channel',
        hint: 'Where updates are posted. Pick one or more.',
        versionId: 'rowj2u3wc8h5',
        fieldKey: 'destination.channel_id',
        multiple: true,
        dependsOn: [],
        // the field only applies when destination.messageto = "channel", which we fix in code
        existingFields: { destination: { messageto: 'channel' } }
      }
    ]
  },
  teams: {
    serviceId: 'rowxzmscatfe',
    name: 'Microsoft Teams',
    icon: 'https://stuff.thingsofbrand.com/microsoft.com/images/img9_Microsoft-Teams-Logo.png',
    category: 'messaging',
    stack: 'microsoft',
    blurb: 'Post updates to a Microsoft Teams channel.',
    // "Send Channel Message"
    send: { actionVersionId: 'rowz23q8bm0r', actionId: 'rowtn16jy5zp' },
    pickers: [
      {
        key: 'team',
        label: 'Team',
        hint: 'The team the channel belongs to.',
        versionId: 'rowz23q8bm0r',
        fieldKey: 'team_id',
        dependsOn: []
      },
      {
        key: 'channel',
        label: 'Channel',
        hint: 'Where updates are posted.',
        versionId: 'rowz23q8bm0r',
        fieldKey: 'channel_id',
        dependsOn: ['team']
      }
    ]
  }
}

export const FILTERED_SERVICES = Object.values(APPS).map((a) => a.serviceId)

export function appByKey(key) {
  const app = APPS[key]
  if (!app) return null
  return { key, ...app }
}

/** The action_ids the Connect popup should ask consent for. */
export function filteredActions(app) {
  return [app.read?.actionId, app.send?.actionId].filter(Boolean)
}

/** Set a dotted path inside a nested object (inputData / existingFields are nested, never flat). */
export function setPath(obj, dotted, value) {
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] && typeof cur[parts[i]] === 'object' ? cur[parts[i]] : {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
  return obj
}

/** Public, browser-safe description of an app (no version ids needed by the browser except via our API). */
export function publicApp(key) {
  const a = APPS[key]
  return {
    key,
    serviceId: a.serviceId,
    name: a.name,
    icon: a.icon,
    category: a.category,
    stack: a.stack,
    blurb: a.blurb,
    filteredActions: filteredActions(a),
    choices: a.choices || [],
    pickers: a.pickers.map(({ key, label, hint, optional, multiple, searchable, dependsOn, onlyWhen }) => ({
      key, label, hint, optional: !!optional, multiple: !!multiple, searchable: !!searchable, dependsOn, onlyWhen
    }))
  }
}
