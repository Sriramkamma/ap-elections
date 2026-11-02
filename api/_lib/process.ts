import { DEFAULT_ALIASES, EXPECTED_ULB_COUNT, PCT_TOLERANCE, type Field, type Level, type TabConfig } from './config.js'

export interface Rec {
  tab: string; level: Level; row: number; snapshot: string
  district: string; ulb: string; ward: string; psNo: string; psName: string
  registered?: number; wardCount?: number; male?: number; female?: number; other?: number
  polled?: number; sourcePct?: number; reportedAt?: number
  isGrandTotal?: boolean
}
export interface Issue { severity: 'error' | 'warn' | 'info'; code: string; message: string; tab?: string; row?: number }
export interface Node {
  key: string; name: string; district?: string; ulb?: string
  registered: number; polled: number; pct: number | null; remaining: number
  srcPct?: number; basis: string; lastReportedAt?: number; incomplete: number
  wardCount?: number; male?: number; female?: number; other?: number
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const num = (v: unknown) => {
  if (v === '' || v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,%\s]/g, ''))
  return Number.isFinite(n) ? n : undefined
}
// Sheets serial dates are timezone-less; treated as IST
const ts = (v: unknown) => {
  if (v === '' || v == null) return undefined
  if (typeof v === 'number') return v > 20000 ? Math.round((v - 25569) * 86400000 - 5.5 * 3600000) : undefined
  const t = Date.parse(String(v)); return Number.isNaN(t) ? undefined : t
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
export const rank = (l: string) => {
  const m = l.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/)
  if (!m) return 1e9
  let h = +m[1] % 12; if (m[3] === 'pm') h += 12
  return h * 60 + (+m[2] || 0)
}

export function parseTab(cfg: TabConfig, values: any[][], issues: Issue[]): Rec[] {
  if (!values.length) return []
  const hr = (cfg.headerRow ?? 1) - 1
  const header = (values[hr] ?? []).map(norm)
  const idx: Partial<Record<Field, number>> = {}
  ;(Object.keys(DEFAULT_ALIASES) as Field[]).forEach(f => {
    const names = [...(cfg.columns?.[f] ?? []), ...DEFAULT_ALIASES[f]].map(norm)
    const i = header.findIndex(h => names.includes(h))
    if (i >= 0) idx[f] = i
  })
  if (idx.ulb == null) {
    issues.push({ severity: 'error', code: 'NO_ULB_COLUMN', tab: cfg.tab, message: `Tab "${cfg.tab}": ULB column not found` })
    return []
  }
  if (cfg.level !== 'roll_reference' && idx.polled == null && idx.sourcePct == null)
    issues.push({ severity: 'warn', code: 'NO_POLLED_COLUMN', tab: cfg.tab, message: `Tab "${cfg.tab}": no votes-polled or percentage column` })

  const out: Rec[] = []
  values.slice(hr + 1).forEach((r, k) => {
    if (!r || r.every(c => c === '' || c == null)) return
    const g = (f: Field) => (idx[f] == null ? undefined : r[idx[f]!])
    const s = (f: Field) => String(g(f) ?? '').trim()
    const rowNo = hr + k + 2
    if (r.some(cell => norm(cell) === 'grandtotal')) {
      out.push({
        tab: cfg.tab, level: cfg.level, row: rowNo,
        snapshot: cfg.snapshot ?? (s('snapshot') || 'UNLABELLED'),
        district: '', ulb: '', ward: '', psNo: '', psName: '',
        registered: num(g('registered')), wardCount: num(g('wardCount')), male: num(g('male')), female: num(g('female')), other: num(g('other')),
        polled: num(g('polled')), sourcePct: num(g('sourcePct')), isGrandTotal: true,
      })
      return
    }
    // A populated worksheet row without a ULB is malformed, not a ULB record.
    // Keep it visible as a validation error while excluding it from record counts
    // and cross-time identity comparisons.
    if (!s('ulb')) {
      issues.push({ severity: 'error', code: 'MISSING_ULB_NAME', tab: cfg.tab, row: rowNo, message: `${cfg.snapshot ?? cfg.tab}: ULB name is missing (row ${rowNo})` })
      return
    }
    out.push({
      tab: cfg.tab, level: cfg.level, row: hr + k + 2,
      snapshot: cfg.snapshot ?? (s('snapshot') || 'UNLABELLED'),
      district: s('district'), ulb: s('ulb'), ward: s('ward'), psNo: s('psNo'), psName: s('psName'),
      registered: num(g('registered')), wardCount: num(g('wardCount')), male: num(g('male')), female: num(g('female')), other: num(g('other')),
      polled: num(g('polled')), sourcePct: num(g('sourcePct')), reportedAt: ts(g('reportedAt')),
    })
  })
  // Percent cells formatted as % come back as fractions (0.45). Convert only if the whole tab is <= 1.
  const pcts = out.map(r => r.sourcePct).filter((x): x is number => x != null)
  if (pcts.length && pcts.every(p => p <= 1)) {
    out.forEach(r => { if (r.sourcePct != null) r.sourcePct *= 100 })
    issues.push({ severity: 'info', code: 'PCT_SCALED', tab: cfg.tab, message: `Tab "${cfg.tab}": percentages read as fractions and scaled x100` })
  }
  return out
}

const k = norm
export function validate(recs: Rec[], issues: Issue[]): Rec[] {
  const seen = new Set<string>(); const kept: Rec[] = []
  const refUlbs = new Set(recs.filter(r => r.level === 'roll_reference').map(r => k(r.ulb)))
  for (const r of recs) {
    const key = [r.tab, r.snapshot, k(r.district), k(r.ulb), k(r.ward), k(r.psNo || r.psName)].join('|')
    if (seen.has(key)) {
      issues.push({ severity: 'warn', code: 'DUPLICATE', tab: r.tab, row: r.row, message: `Duplicate record (${r.ulb} / ward ${r.ward} / PS ${r.psNo || r.psName}, ${r.snapshot}); first kept` })
      if (r.level !== 'ulb_summary') continue
    }
    seen.add(key); kept.push(r)
    if (r.isGrandTotal) continue
    if (r.level === 'roll_reference') continue
    const at = { tab: r.tab, row: r.row }
    if (refUlbs.size && !refUlbs.has(k(r.ulb))) issues.push({ severity: 'warn', code: 'UNKNOWN_ULB', ...at, message: `ULB "${r.ulb}" not in reference list` })
    if (r.polled == null && r.sourcePct == null) issues.push({ severity: 'warn', code: 'MISSING_POLLED', ...at, message: `Missing votes polled (${r.ulb})` })
    if (r.sourcePct != null && (r.sourcePct < 0 || r.sourcePct > 100)) issues.push({ severity: 'error', code: 'INVALID_PCT', ...at, message: `Invalid percentage ${r.sourcePct} (${r.ulb})` })
    if (r.registered != null && r.polled != null && r.polled > r.registered) issues.push({ severity: 'error', code: 'POLLED_GT_VOTERS', ...at, message: `Polled exceeds registered (${r.ulb})` })
    if (r.registered != null && r.polled != null && r.registered > 0 && r.sourcePct != null) {
      const calc = (r.polled / r.registered) * 100
      if (Math.abs(calc - r.sourcePct) > PCT_TOLERANCE) issues.push({ severity: 'warn', code: 'PCT_MISMATCH', ...at, message: `Source ${r.sourcePct.toFixed(2)}% vs calculated ${calc.toFixed(2)}% (${r.ulb})` })
    }
  }
  return kept
}

export function validateReportingTabs(bySnapshot: Record<string, Rec[]>, issues: Issue[]) {
  const recordsOf = (rows: Rec[]) => rows.filter(r => r.level === 'ulb_summary' && !r.isGrandTotal)
  const reportingTimes = ['11 AM', '1 PM', '3 PM', '5 PM', '10 PM']
  const reference = new Set(recordsOf(bySnapshot[reportingTimes[0]] ?? []).map(r => norm(r.ulb)).filter(Boolean))
  for (const [snapshot, rows] of Object.entries(bySnapshot)) {
    const records = recordsOf(rows)
    const sourceTotal = rows.find(r => r.level === 'ulb_summary' && r.isGrandTotal)
    if (sourceTotal) {
      const total = (field: 'registered' | 'polled' | 'wardCount') => records.every(r => r[field] != null)
        ? sum(records.map(r => r[field]!)) : undefined
      for (const [field, label] of [['registered', 'total voters'], ['polled', 'votes polled'], ['wardCount', 'ward count']] as const) {
        const calculated = total(field)
        const source = sourceTotal[field]
        if (calculated != null && source != null && calculated !== source)
          issues.push({ severity: 'error', code: 'GRAND_TOTAL_MISMATCH', tab: sourceTotal.tab, row: sourceTotal.row, message: `${snapshot}: source grand total ${label} (${source.toLocaleString('en-IN')}) differs from ULB sum (${calculated.toLocaleString('en-IN')})` })
      }
      const calculatedPct = total('registered') && total('polled') != null ? total('polled')! / total('registered')! * 100 : undefined
      if (calculatedPct != null && sourceTotal.sourcePct != null && Math.abs(calculatedPct - sourceTotal.sourcePct) > PCT_TOLERANCE)
        issues.push({ severity: 'error', code: 'GRAND_TOTAL_PCT_MISMATCH', tab: sourceTotal.tab, row: sourceTotal.row, message: `${snapshot}: source grand total percentage (${sourceTotal.sourcePct.toFixed(2)}%) differs from calculated ${calculatedPct.toFixed(2)}%` })
    }
    if (!records.length) continue
    const seen = new Set<string>()
    for (const r of records) {
      const id = norm(r.ulb)
      if (!id) continue
      if (seen.has(id)) issues.push({ severity: 'error', code: 'DUPLICATE_ULB', tab: r.tab, row: r.row, message: `${snapshot}: duplicate ULB "${r.ulb}"` })
      seen.add(id)
      if (r.registered == null || r.polled == null || r.wardCount == null || r.sourcePct == null) issues.push({ severity: 'error', code: 'MISSING_REQUIRED_VALUE', tab: r.tab, row: r.row, message: `${snapshot}: ${r.ulb} is missing total voters, votes polled, ward count, or source polling percentage` })
    }
    if (records.length !== EXPECTED_ULB_COUNT) issues.push({ severity: snapshot === '10 PM' && records.length < EXPECTED_ULB_COUNT ? 'warn' : 'error', code: 'ULB_COUNT', tab: snapshot, message: `${snapshot}: expected ${EXPECTED_ULB_COUNT} ULB records; found ${records.length}` })
    if (snapshot !== '11 AM' && reference.size) {
      const current = new Set(records.map(r => norm(r.ulb)).filter(Boolean))
      for (const id of reference) if (!current.has(id)) issues.push({ severity: snapshot === '10 PM' ? 'warn' : 'error', code: 'MISSING_ULB', tab: snapshot, message: `${snapshot}: ULB "${id}" is missing` })
      for (const id of current) if (!reference.has(id)) issues.push({ severity: 'error', code: 'UNEXPECTED_ULB', tab: snapshot, message: `${snapshot}: ULB "${id}" was not present at 11 AM` })
    }
  }
  const first = new Map<string, Rec>()
  for (const snapshot of reportingTimes) for (const r of recordsOf(bySnapshot[snapshot] ?? [])) {
    const id = norm(r.ulb); if (!id) continue
    const prev = first.get(id)
    if (!prev) first.set(id, r)
    else {
      if (prev.registered != null && r.registered != null && prev.registered !== r.registered)
        issues.push({ severity: 'error', code: 'VOTER_TOTAL_CHANGED', tab: snapshot, row: r.row, message: `${r.ulb}: total voters differ between ${prev.snapshot} (${prev.registered.toLocaleString('en-IN')}) and ${snapshot} (${r.registered.toLocaleString('en-IN')})` })
      if (prev.wardCount != null && r.wardCount != null && prev.wardCount !== r.wardCount)
        issues.push({ severity: 'error', code: 'WARD_COUNT_CHANGED', tab: snapshot, row: r.row, message: `${r.ulb}: ward count differs between ${prev.snapshot} (${prev.wardCount}) and ${snapshot} (${r.wardCount})` })
    }
  }
}

type Eff = Rec & { reg?: number; pol?: number }

function mkNode(key: string, name: string, rows: Eff[], basis: string, extra: Partial<Node> = {}): Node {
  const ok = rows.filter(r => r.reg != null && r.pol != null)
  const registered = sum(ok.map(r => r.reg!)); const polled = sum(ok.map(r => r.pol!))
  const g = (f: 'male' | 'female' | 'other' | 'wardCount') => { const v = rows.map(r => r[f]).filter((x): x is number => x != null); return v.length ? sum(v) : undefined }
  return {
    key, name, registered, polled, remaining: registered - polled,
    pct: registered > 0 ? (polled / registered) * 100 : null,
    basis, incomplete: rows.length - ok.length,
    lastReportedAt: Math.max(0, ...rows.map(r => r.reportedAt ?? 0)) || undefined,
    wardCount: g('wardCount'), male: g('male'), female: g('female'), other: g('other'), ...extra,
  }
}
const group = <T,>(a: T[], f: (x: T) => string) => { const m = new Map<string, T[]>(); a.forEach(x => { const key = f(x); (m.get(key) ?? m.set(key, []).get(key)!).push(x) }); return m }

export function aggregate(all: Rec[], snapshot: string, issues: Issue[]) {
  const ref = all.filter(r => r.level === 'roll_reference')
  const rIdx = new Map<string, Rec>(); const rSum = new Map<string, number>()
  ref.forEach(r => {
    if (r.registered == null) return
    for (const key of [`${k(r.ulb)}|${k(r.ward)}|${k(r.psNo)}`, `${k(r.ulb)}|${k(r.ward)}`, k(r.ulb)])
      rSum.set(key, (rSum.get(key) ?? 0) + r.registered)
    rIdx.set(`${k(r.ulb)}|${k(r.ward)}|${k(r.psNo)}`, r)
  })
  const eff = (r: Rec): Eff => {
    const lookup = r.level === 'polling_station' ? rSum.get(`${k(r.ulb)}|${k(r.ward)}|${k(r.psNo)}`)
      : r.level === 'ward' ? rSum.get(`${k(r.ulb)}|${k(r.ward)}`) : rSum.get(k(r.ulb))
    const reg = r.registered ?? lookup
    let pol = r.polled
    if (pol == null && r.sourcePct != null && reg) pol = Math.round((r.sourcePct * reg) / 100)
    const g = rIdx.get(`${k(r.ulb)}|${k(r.ward)}|${k(r.psNo)}`)
    return { ...r, reg, pol, male: r.male ?? g?.male, female: r.female ?? g?.female, other: r.other ?? g?.other }
  }
  const rows = all.filter(r => r.snapshot === snapshot && r.level !== 'roll_reference' && !r.isGrandTotal).map(eff)
  const ulbs: Node[] = []; const wards: Node[] = []; const stations: Node[] = []

  for (const [ukey, urows] of group(rows, r => k(r.ulb))) {
    const ps = urows.filter(r => r.level === 'polling_station')
    const wd = urows.filter(r => r.level === 'ward')
    const sm = urows.filter(r => r.level === 'ulb_summary')
    const basisRows = ps.length ? ps : wd.length ? wd : sm
    const basis = ps.length ? 'polling_station' : wd.length ? 'ward' : 'ulb_summary'
    const first = urows[0]
    const node = mkNode(ukey, first.ulb, basisRows, basis, { district: first.district, ulb: first.ulb, srcPct: sm.length ? sm[0].sourcePct : undefined })
    ulbs.push(node)

    // reconciliation: detail vs summary (never combined, only compared)
    if (basis !== 'ulb_summary' && sm.length) {
      const s = mkNode(ukey, first.ulb, sm, 'ulb_summary')
      const sp = s.pct ?? sm[0].sourcePct
      if (sp != null && node.pct != null && Math.abs(sp - node.pct) > PCT_TOLERANCE)
        issues.push({ severity: 'warn', code: 'RECON_ULB', message: `${first.ulb} (${snapshot}): summary ${sp.toFixed(2)}% vs ${basis} total ${node.pct.toFixed(2)}%` })
    }
    // ward-level: from PS if present, else ward rows; compare when both exist
    const wardFromPs = group(ps, r => k(r.ward)); const wardRows = group(wd, r => k(r.ward))
    for (const wkey of new Set([...wardFromPs.keys(), ...wardRows.keys()])) {
      const src = wardFromPs.get(wkey) ?? wardRows.get(wkey)!
      const wn = mkNode(`${ukey}|${wkey}`, `Ward ${src[0].ward}`, src, wardFromPs.has(wkey) ? 'polling_station' : 'ward', { district: first.district, ulb: first.ulb })
      wards.push(wn)
      if (wardFromPs.has(wkey) && wardRows.has(wkey)) {
        const w2 = mkNode('', '', wardRows.get(wkey)!, 'ward')
        if (wn.pct != null && w2.pct != null && Math.abs(wn.pct - w2.pct) > PCT_TOLERANCE)
          issues.push({ severity: 'warn', code: 'RECON_WARD', message: `${first.ulb} ward ${src[0].ward} (${snapshot}): ward sheet ${w2.pct.toFixed(2)}% vs polling-station total ${wn.pct.toFixed(2)}%` })
      }
    }
    ps.forEach(r => stations.push(mkNode(`${ukey}|${k(r.ward)}|${k(r.psNo)}`, r.psName || `PS ${r.psNo}`, [r], 'polling_station', { district: r.district, ulb: r.ulb, srcPct: r.sourcePct })))
  }

  // roll up ULB nodes only (no mixing of levels)
  const districts: Node[] = []
  for (const [dkey, us] of group(ulbs, u => k(u.district ?? ''))) {
    const registered = sum(us.map(u => u.registered)); const polled = sum(us.map(u => u.polled))
    districts.push({
      key: dkey, name: us[0].district || '(unspecified)', registered, polled, remaining: registered - polled,
      pct: registered > 0 ? (polled / registered) * 100 : null, basis: 'ulb_rollup',
      incomplete: sum(us.map(u => u.incomplete)), lastReportedAt: Math.max(0, ...us.map(u => u.lastReportedAt ?? 0)) || undefined,
    })
  }
  const registered = sum(districts.map(d => d.registered)); const polled = sum(districts.map(d => d.polled))
  const state: Node = {
    key: 'state', name: 'Andhra Pradesh', registered, polled, remaining: registered - polled,
    pct: registered > 0 ? (polled / registered) * 100 : null, basis: 'district_rollup',
    incomplete: sum(districts.map(d => d.incomplete)), lastReportedAt: Math.max(0, ...districts.map(d => d.lastReportedAt ?? 0)) || undefined,
  }
  return { state, districts, ulbs, wards, stations }
}

export function timeline(all: Rec[], issues: Issue[]) {
  const labels = [...new Set(all.filter(r => r.level !== 'roll_reference').map(r => r.snapshot))].sort((a, b) => rank(a) - rank(b))
  let prev: Node | undefined
  return labels.map(label => {
    const { state, ulbs } = aggregate(all, label, [])
    const incVotes = prev ? state.polled - prev.polled : null
    const incPct = prev && state.pct != null && prev.pct != null ? state.pct - prev.pct : null
    if (incVotes != null && incVotes < 0) issues.push({ severity: 'error', code: 'NEGATIVE_INCREMENT', message: `Cumulative votes fell between snapshots → ${label} (${incVotes})` })
    prev = state
    return { label, registered: state.registered, polled: state.polled, pct: state.pct, incVotes, incPct, reportingUlbs: ulbs.length, lastReportedAt: state.lastReportedAt }
  })
}
