import { google } from 'googleapis'
import { TABS, type TabConfig } from './config.js'

type Result = { tabs: TabConfig[]; values: Record<string, any[][]>; modifiedTime?: string; demo: boolean; stale?: boolean }
let mem: { at: number; v: Result } | null = null

const DEMO: Result = {
  demo: true,
  tabs: [
    { tab: 'PS', level: 'polling_station' },
    { tab: 'REF', level: 'roll_reference', snapshot: 'REF' },
  ],
  values: {
    PS: [
      ['District', 'ULB', 'Ward', 'PS No', 'Total Voters', 'Votes Polled', 'Slot'],
      ['DEMO District 1', 'DEMO ULB 1', '1', '1', 1000, 200, '9 AM'],
      ['DEMO District 1', 'DEMO ULB 1', '1', '2', 1000, 250, '9 AM'],
      ['DEMO District 1', 'DEMO ULB 1', '1', '1', 1000, 500, '11 AM'],
      ['DEMO District 1', 'DEMO ULB 1', '1', '2', 1000, 550, '11 AM'],
      ['DEMO District 2', 'DEMO ULB 2', '1', '1', 2000, 300, '9 AM'],
      ['DEMO District 2', 'DEMO ULB 2', '1', '1', 2000, 900, '11 AM'],
    ],
    REF: [
      ['District', 'ULB', 'Ward', 'PS No', 'Total Voters'],
      ['DEMO District 1', 'DEMO ULB 1', '1', '1', 1000],
      ['DEMO District 1', 'DEMO ULB 1', '1', '2', 1000],
      ['DEMO District 2', 'DEMO ULB 2', '1', '1', 2000],
    ],
  },
}

export async function readSheets(force = false): Promise<Result> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const keyRaw = process.env.GOOGLE_PRIVATE_KEY
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!email || !keyRaw || !id) return DEMO

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
    const v: Result = { tabs: TABS, values, modifiedTime: meta?.data.modifiedTime ?? undefined, demo: false }
    mem = { at: Date.now(), v }
    return v
  } catch (e) {
    if (mem) return { ...mem.v, stale: true }
    throw e
  }
}
