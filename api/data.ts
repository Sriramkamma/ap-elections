import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSheets } from './_lib/sheets.js'
import { parseTab, validate, aggregate, timeline, rank, type Issue, type Rec } from './_lib/process.js'
import { persistAndMerge } from './_lib/store.js'

function guard(req: VercelRequest, res: VercelResponse) {
  const origin = process.env.ALLOWED_ORIGIN
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'x-access-key')
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false }
  const key = process.env.DASHBOARD_ACCESS_KEY
  if (key && req.headers['x-access-key'] !== key) { res.status(401).json({ error: 'Unauthorized' }); return false }
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return
  const issues: Issue[] = []
  try {
    const force = req.query.refresh === '1'
    const src = await readSheets(force)
    if (src.demo) issues.push({ severity: 'info', code: 'DEMO', message: 'DEMO MODE: Google credentials not configured' })
    if (src.stale) issues.push({ severity: 'warn', code: 'STALE', message: 'Google Sheets unreachable; showing last good data' })

    let recs: Rec[] = src.tabs.flatMap(t => parseTab(t, src.values[t.tab] ?? [], issues))
    recs = validate(recs, issues)
    if (!src.demo) recs = await persistAndMerge(recs, issues)

    const snaps = [...new Set(recs.filter(r => r.level !== 'roll_reference').map(r => r.snapshot))].sort((a, b) => rank(a) - rank(b))
    const snapshot = (req.query.snapshot as string) || snaps[snaps.length - 1]
    const agg = aggregate(recs, snapshot, issues)
    const tl = timeline(recs, issues)
    const totalUlbs = new Set(recs.map(r => r.ulb.toLowerCase().replace(/[^a-z0-9]/g, ''))).size

    const ulb = req.query.ulb as string | undefined
    res.setHeader('Cache-Control', force || process.env.DASHBOARD_ACCESS_KEY ? 'private, no-store' : 's-maxage=60, stale-while-revalidate=120')
    res.json({
      meta: { demo: src.demo, snapshot, snapshots: snaps, syncedAt: Date.now(), sourceUpdatedAt: src.modifiedTime ?? null, totalUlbs, reportingUlbs: agg.ulbs.length },
      state: agg.state, districts: agg.districts, ulbs: agg.ulbs, timeline: tl,
      wards: ulb ? agg.wards.filter(w => w.key.startsWith(ulb + '|')) : undefined,
      stations: ulb ? agg.stations.filter(s => s.key.startsWith(ulb + '|')) : undefined,
      issues: issues.slice(0, 500), issueCount: issues.length,
    })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'Sync failed', detail: process.env.NODE_ENV === 'production' ? undefined : e.message })
  }
}
