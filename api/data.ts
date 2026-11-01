import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSheets } from './_lib/sheets.js'
import { parseTab, validate, validateReportingTabs, aggregate, timeline, type Issue, type Rec } from './_lib/process.js'
import { EXPECTED_ULB_COUNT, TABS } from './_lib/config.js'

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
    if (src.stale) issues.push({ severity: 'warn', code: 'STALE', message: src.staleReason ?? 'Google Sheets sync failed; showing the last successfully fetched real data.' })

    let recs: Rec[] = src.tabs.flatMap(t => parseTab(t, src.values[t.tab] ?? [], issues))
    recs = validate(recs, issues)
    const bySnapshot: Record<string, Rec[]> = Object.fromEntries(TABS.map(tab => [tab.snapshot ?? tab.tab, recs.filter(r => r.snapshot === (tab.snapshot ?? tab.tab))]))
    validateReportingTabs(bySnapshot, issues)
    const reports = TABS.map(tab => {
      const snapshot = tab.snapshot ?? tab.tab
      const rows = bySnapshot[snapshot] ?? []
      const ulbs = rows.filter(r => r.level === 'ulb_summary')
      const reportIssues = issues.filter(issue => issue.tab === tab.tab || issue.tab === snapshot)
      const available = !src.missingTabs.includes(tab.tab) && ulbs.length > 0
      const valid = available && ulbs.length === EXPECTED_ULB_COUNT && !reportIssues.some(issue => issue.severity === 'error')
      const agg = aggregate(recs, snapshot, [])
      return { snapshot, available, reason: src.missingTabs.includes(tab.tab) ? 'Worksheet tab not found in the spreadsheet.' : !ulbs.length ? 'Worksheet has no ULB records.' : undefined, valid, recordCount: ulbs.length, totalWards: ulbs.every(r => r.wardCount != null) ? ulbs.reduce((sum, row) => sum + (row.wardCount ?? 0), 0) : null, state: agg.state, districts: agg.districts, ulbs: agg.ulbs, issues: reportIssues }
    })
    const snaps = TABS.map(tab => tab.snapshot ?? tab.tab)
    const snapshot = snaps.includes(req.query.snapshot as string) ? req.query.snapshot as string : '3 PM'
    const agg = reports.find(report => report.snapshot === snapshot)!
    const selectedAggregate = aggregate(recs, snapshot, [])
    const tl = timeline(recs, issues)
    const totalUlbs = EXPECTED_ULB_COUNT

    const ulb = req.query.ulb as string | undefined
    res.setHeader('Cache-Control', force || process.env.DASHBOARD_ACCESS_KEY ? 'private, no-store' : 's-maxage=60, stale-while-revalidate=120')
    res.json({
      meta: { snapshot, snapshots: snaps, syncedAt: src.syncedAt, sourceUpdatedAt: src.modifiedTime ?? null, totalUlbs, reportingUlbs: agg.recordCount },
      reports, state: agg.state, districts: agg.districts, ulbs: agg.ulbs, timeline: tl,
      wards: ulb ? selectedAggregate.wards.filter(w => w.key.startsWith(ulb + '|')) : undefined,
      stations: ulb ? selectedAggregate.stations.filter(s => s.key.startsWith(ulb + '|')) : undefined,
      issues: issues.slice(0, 500), issueCount: issues.length,
    })
  } catch (e: any) {
    console.error(e)
    const statusCode = Number.isInteger(e?.statusCode) && e.statusCode >= 400 && e.statusCode <= 599 ? e.statusCode : 500
    const message = typeof e?.message === 'string' && e.message ? e.message : 'Unexpected data synchronization error.'
    res.status(statusCode).json({ error: message })
  }
}
