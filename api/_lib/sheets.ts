import { google } from 'googleapis'
import { TABS, type TabConfig } from './config.js'

type Result = { tabs: TabConfig[]; values: Record<string, any[][]>; missingTabs: string[]; syncedAt: number; modifiedTime?: string; stale?: boolean; staleReason?: string }
type ErrorWithStatus = Error & { statusCode: number; code: string }

let mem: { at: number; v: Result } | null = null

function sheetsError(message: string, statusCode: number, code: string): ErrorWithStatus {
  return Object.assign(new Error(message), { statusCode, code })
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw sheetsError(`Google Sheets configuration missing: ${name}`, 503, 'SHEETS_CONFIG')
  return value
}

function normalizeGooglePrivateKey(key: string): string {
  let normalized = key.trim()
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(normalized)
      normalized = typeof parsed === 'string' ? parsed : normalized.slice(1, -1)
    } catch {
      normalized = normalized.slice(1, -1)
    }
  } else if (normalized.startsWith("'") && normalized.endsWith("'")) {
    normalized = normalized.slice(1, -1)
  }

  return normalized
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .trim()
}

function safeErrorDetail(error: any): string {
  const detail = String(
    error?.response?.data?.error?.message ??
    error?.errors?.[0]?.message ??
    error?.message ??
    '',
  )
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/gi, '[redacted private key]')
    .replace(/private_key\s*[:=]\s*[^\s,;]+/gi, 'private_key=[redacted]')
    .trim()
  return detail.slice(0, 320)
}

function googleRequestError(error: any): ErrorWithStatus {
  const status = Number(error?.response?.status ?? error?.code)
  const reason = String(error?.response?.data?.error?.status ?? error?.errors?.[0]?.reason ?? '').toLowerCase()
  const message = String(error?.response?.data?.error?.message ?? error?.message ?? '').toLowerCase()
  const detail = safeErrorDetail(error)

  if (message.includes('decoder routines') || message.includes('unsupported')) {
    return sheetsError('GOOGLE_PRIVATE_KEY could not be decoded. Use the private_key value only; surrounding quotes and escaped or real newlines are supported, but the PEM content must be complete.', 503, 'SHEETS_KEY_FORMAT')
  }
  if (status === 401 || message.includes('invalid_grant') || message.includes('invalid jwt')) {
    return sheetsError('Google service account authentication failed. Check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY, and confirm the key is active.', 502, 'SHEETS_AUTH')
  }
  if (reason === 'service_disabled' || message.includes('api has not been used') || message.includes('api is disabled')) {
    return sheetsError('Google Sheets API is disabled for the service account project. Enable the Google Sheets API in Google Cloud Console.', 502, 'SHEETS_API_DISABLED')
  }
  if (status === 403) {
    return sheetsError('Google Sheets access was denied. Enable the Google Sheets API and share the spreadsheet with the service account as a Viewer.', 403, 'SHEETS_ACCESS_DENIED')
  }
  if (status === 404) {
    return sheetsError('Google spreadsheet not found or not accessible. Verify GOOGLE_SHEETS_SPREADSHEET_ID and the sheet sharing permissions.', 404, 'SHEETS_SPREADSHEET_NOT_FOUND')
  }
  if (status === 429) {
    return sheetsError('Google Sheets rate limit reached. Wait briefly and refresh the dashboard.', 429, 'SHEETS_RATE_LIMIT')
  }
  if (status === 400) {
    return sheetsError(`Google Sheets rejected the request (400): ${detail || 'Check the spreadsheet ID, worksheet range, and API request.'}`, 502, 'SHEETS_BAD_REQUEST')
  }
  if (status >= 500 || ['econnreset', 'enotfound', 'etimedout'].includes(String(error?.code ?? '').toLowerCase())) {
    return sheetsError('Google Sheets could not be reached. Check connectivity and try again.', 502, 'SHEETS_UNAVAILABLE')
  }
  return sheetsError(`Google Sheets synchronization failed${status ? ` (HTTP ${status})` : ''}: ${detail || 'Verify the service account, spreadsheet ID, API access, and configured worksheet tabs.'}`, 502, 'SHEETS_SYNC')
}

export async function readSheets(force = false): Promise<Result> {
  const email = requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const keyRaw = requiredEnv('GOOGLE_PRIVATE_KEY')
  const spreadsheetId = requiredEnv('GOOGLE_SHEETS_SPREADSHEET_ID')
  const privateKey = normalizeGooglePrivateKey(keyRaw)
  if (!/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(privateKey)) {
    throw sheetsError('GOOGLE_PRIVATE_KEY is not a valid PEM private key. Use only the private_key value from the service account JSON file, with the complete BEGIN and END lines.', 503, 'SHEETS_KEY_INVALID')
  }

  const ttl = (force ? 30 : Number(process.env.CACHE_TTL_SECONDS ?? 90)) * 1000
  if (!force && mem && Date.now() - mem.at < ttl) return mem.v

  try {
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const workbook = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties(title),sheets(properties(title))',
    })
    const availableTabs = (workbook.data.sheets ?? []).map(sheet => sheet.properties?.title).filter((title): title is string => Boolean(title))
    const missingTabs = TABS.map(tab => tab.tab).filter(tabName => !availableTabs.includes(tabName))
    const existingTabs = TABS.filter(tab => availableTabs.includes(tab.tab))
    const [batch, driveMetadata] = await Promise.all([
      existingTabs.length ? sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: existingTabs.map(tab => `'${tab.tab.replace(/'/g, "''")}'`),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      }) : Promise.resolve({ data: { valueRanges: [] } }),
      google.drive({ version: 'v3', auth }).files.get({ fileId: spreadsheetId, fields: 'modifiedTime' }).catch(() => null),
    ])

    const values: Record<string, any[][]> = {}
    existingTabs.forEach((tab, index) => { values[tab.tab] = (batch.data.valueRanges?.[index]?.values as any[][]) ?? [] })
    missingTabs.forEach(tab => { values[tab] = [] })
    const result: Result = { tabs: TABS, values, missingTabs, syncedAt: Date.now(), modifiedTime: driveMetadata?.data.modifiedTime ?? undefined }
    mem = { at: Date.now(), v: result }
    return result
  } catch (error: any) {
    const syncError = googleRequestError(error)
    if (mem) return { ...mem.v, stale: true, staleReason: syncError.message }
    throw syncError
  }
}
