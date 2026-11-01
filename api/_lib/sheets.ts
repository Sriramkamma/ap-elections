import { google } from 'googleapis'
import { TABS, type TabConfig } from './config.js'

type Result = { tabs: TabConfig[]; values: Record<string, any[][]>; modifiedTime?: string; stale?: boolean }
let mem: { at: number; v: Result } | null = null

export async function readSheets(force = false): Promise<Result> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const keyRaw = process.env.GOOGLE_PRIVATE_KEY
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  const missing = [
    !email && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    !keyRaw && 'GOOGLE_PRIVATE_KEY',
    !id && 'GOOGLE_SHEETS_SPREADSHEET_ID',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Google Sheets configuration missing: ${missing.join(', ')}`)

  const ttl = (force ? 30 : Number(process.env.CACHE_TTL_SECONDS ?? 90)) * 1000
  if (mem && Date.now() - mem.at < ttl) return mem.v

  try {
    const auth = new google.auth.JWT({
      email,
      key: keyRaw.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    })
    const [bg, meta] = await Promise.all([
      google.sheets({ version: 'v4', auth }).spreadsheets.values.batchGet({
        spreadsheetId: id,
        ranges: TABS.map(t => `'${t.tab.replace(/'/g, "''")}'`),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      }),
      google.drive({ version: 'v3', auth }).files.get({ fileId: id, fields: 'modifiedTime' }).catch(() => null),
    ])
    const values: Record<string, any[][]> = {}
    TABS.forEach((t, i) => { values[t.tab] = (bg.data.valueRanges?.[i]?.values as any[][]) ?? [] })
    const v: Result = { tabs: TABS, values, modifiedTime: meta?.data.modifiedTime ?? undefined }
    mem = { at: Date.now(), v }
    return v
  } catch (e) {
    if (mem) return { ...mem.v, stale: true }
    throw e
  }
}
