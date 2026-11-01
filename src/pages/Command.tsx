import { Activity, AlertTriangle, Clock3, MapPin, RefreshCw, Search, Users, Vote } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useState } from 'react'
import { useData } from '../hooks/useData'

const n = (x?: number | null) => x == null ? '—' : x.toLocaleString('en-IN')
const p = (x?: number | null) => x == null ? '—' : `${x.toFixed(2)}%`
const pp = (x?: number | null) => x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)} pp`
const t = (x?: number | null) => x ? new Date(x).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'
const key = (s: string) => s.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
type Row = { key: string; name: string; district?: string; registered: number; polled: number; pct: number | null; remaining: number; wardCount?: number }
const TIMES = ['11 AM', '1 PM', '3 PM', '5 PM'] as const
const timeKey = (time: string) => ({ '11 AM': 'a', '1 PM': 'b', '3 PM': 'c', '5 PM': 'd' } as const)[time as typeof TIMES[number]]

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Users; tone?: string }) {
  return <article className="metric glass-panel"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone ?? ''}`}><Icon size={17} /></span></div><strong>{value}</strong><small>{note}</small></article>
}

export default function Command() {
  const { data, error, loading, reload } = useData()
  const [snapshot, setSnapshot] = useState('5 PM')
  const [search, setSearch] = useState('')
  const [districtFilter, setDistrictFilter] = useState('All districts')
  const [sortBy, setSortBy] = useState('poll-high')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  if (!data) return <div className="loading-screen"><div className="loading-mark">{error ? <AlertTriangle /> : <Activity />}</div><p>{error ? `Unable to load dashboard: ${error}` : 'Connecting to live election data…'}</p>{error && <button className="refresh-button" onClick={reload}>Retry</button>}</div>

  const reports = data.reports ?? []
  const selected = reports.find((r: any) => r.snapshot === snapshot)
  const usable = (name: string) => reports.find((r: any) => r.snapshot === name && r.valid)
  const trend = TIMES.map(name => { const report = usable(name); return { label: name, pct: report?.state?.pct ?? null } })
  const selectedRows: Row[] = selected?.valid ? selected.ulbs : []
  const reportMap = Object.fromEntries(TIMES.map(name => [name, new Map((usable(name)?.ulbs ?? []).map((row: Row) => [key(row.name), row]))])) as Record<string, Map<string, Row>>
  const comparisons = (() => {
    const maps = TIMES.map(time => reportMap[time])
    const ids = new Set(maps.flatMap(map => [...map.keys()]))
    return [...ids].map(id => {
      const [a, b, c, d] = maps.map(map => map.get(id)); const row = a ?? b ?? c ?? d!
      return { id, name: row.name, district: row.district ?? '', a: a?.pct ?? null, b: b?.pct ?? null, c: c?.pct ?? null, d: d?.pct ?? null, increase: a?.pct != null && d?.pct != null ? d.pct - a.pct : null }
    })
  })()
  const districts = (() => {
    const list = new Set<string>()
    reports.forEach((r: any) => (r.valid ? r.ulbs : []).forEach((u: Row) => { if (u.district) list.add(u.district) }))
    return [...list].sort((a, b) => a.localeCompare(b))
  })()
  const districtStats = districts.map(name => {
    const byTime = (time: string) => {
      const rows = (usable(time)?.ulbs ?? []).filter((row: Row) => row.district === name)
      const registered = rows.reduce((sum: number, row: Row) => sum + row.registered, 0)
      const polled = rows.reduce((sum: number, row: Row) => sum + row.polled, 0)
      return { rows, registered, polled, pct: registered ? polled / registered * 100 : null }
    }
    const a = byTime('11 AM'); const b = byTime('1 PM'); const c = byTime('3 PM'); const d = byTime('5 PM')
    return { name, count: d.rows.length || c.rows.length || b.rows.length || a.rows.length, a: a.pct, b: b.pct, c: c.pct, d: d.pct, increase: a.pct != null && d.pct != null ? d.pct - a.pct : null }
  })
  const query = search.trim().toLocaleLowerCase()
  const filtered = comparisons.filter(row => (!query || `${row.name} ${row.district}`.toLocaleLowerCase().includes(query)) && (districtFilter === 'All districts' || row.district === districtFilter))
  filtered.sort((a, b) => sortBy === 'poll-low' ? (a[timeKey(snapshot)] ?? Infinity) - (b[timeKey(snapshot)] ?? Infinity) : sortBy === 'increase-low' ? (a.increase ?? Infinity) - (b.increase ?? Infinity) : sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'increase-high' ? (b.increase ?? -Infinity) - (a.increase ?? -Infinity) : (b[timeKey(snapshot)] ?? -Infinity) - (a[timeKey(snapshot)] ?? -Infinity))
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedPctKey = timeKey(snapshot)
  const delta = (left: string, right: string) => { const a = usable(left)?.state?.pct; const b = usable(right)?.state?.pct; return a == null || b == null ? null : b - a }
  const performers = selectedRows.slice().sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
  const timeIndex = TIMES.indexOf(snapshot as typeof TIMES[number])
  const previousKey = timeIndex > 0 ? timeKey(TIMES[timeIndex - 1]) : 'a'
  const increaseLabel = timeIndex > 0 ? `${TIMES[timeIndex - 1]}–${snapshot}` : 'No earlier reporting time'
  const increaseRanks = comparisons.map(row => ({ ...row, slotIncrease: timeIndex > 0 && row[previousKey] != null && row[timeKey(snapshot)] != null ? row[timeKey(snapshot)]! - row[previousKey]! : null })).filter(row => row.slotIncrease != null).sort((a, b) => (b.slotIncrease ?? -Infinity) - (a.slotIncrease ?? -Infinity))
  const allWarnings = (data.issues ?? reports.flatMap((r: any) => r.issues ?? [])).filter((issue: any) => issue.severity !== 'info')
  const isStale = !!data.issues?.some((issue: any) => issue.code === 'STALE')
  const missingReports = reports.filter((r: any) => !r.available)
  const totalPages = pages

  return <div className="dashboard-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar glass-panel"><a className="brand" href="#top"><span className="brand-seal">AP</span><span><b>AP Election</b><small>COMMAND CENTRE <i>2026</i></small></span></a><div className="topbar-right"><div className={`live-status ${error || missingReports.length || isStale ? 'status-warn' : ''}`}><span className="status-dot" />{error ? 'Sync issue' : isStale ? 'Showing last successful sync' : missingReports.length ? 'Missing worksheet data' : 'Live data'}</div><div className="sync-meta"><span>Last successful sync</span><b>{t(data.meta?.syncedAt)}</b></div><button className="refresh-button" onClick={reload} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /><span>{loading ? 'Syncing' : 'Refresh'}</span></button></div></header>
    <main id="top" className="dashboard-content">
      <section className="page-heading"><div><div className="eyebrow"><MapPin size={13} /> ANDHRA PRADESH · LIVE OVERVIEW</div><h1>Election pulse</h1><p>Polling progress and time-wise comparison from the reporting worksheets.</p></div><div className="snapshot-pill"><span className="snapshot-dot" /><span><small>SELECT REPORTING TIME</small><b>{snapshot}</b></span><span className="snapshot-divider" /><label className="snapshot-select-label"><span className="sr-only">Reporting time</span><select aria-label="Reporting time" value={snapshot} onChange={e => { setSnapshot(e.target.value); setPage(1) }}>{TIMES.map(time => <option key={time}>{time}</option>)}</select></label></div></section>

      {error && <div className="quality-alert"><AlertTriangle size={17} /><span><b>Synchronization issue</b><small>{error} {data ? 'The figures shown are from the last successful Google Sheets sync.' : ''}</small></span></div>}
      {missingReports.length > 0 && <div className="quality-alert"><AlertTriangle size={17} /><span><b>Reporting data missing</b><small>{missingReports.map((r: any) => `${r.snapshot}: ${r.reason ?? 'worksheet missing or contains no ULB records'}`).join(' · ')}</small></span></div>}
      {allWarnings.length > 0 && <div className="quality-alert"><AlertTriangle size={17} /><span><b>{allWarnings.length} data validation {allWarnings.length === 1 ? 'issue' : 'issues'}</b><small>{allWarnings.slice(0, 5).map((issue: any) => issue.message).join(' · ')}{allWarnings.length > 5 ? ` · and ${allWarnings.length - 5} more (see comparison details)` : ''}</small></span></div>}

      <section className="metrics-grid"><Metric label="Total ULBs" value={selected?.valid ? n(selected.recordCount) : '—'} note={selected?.valid ? 'Validated source records' : selected?.available ? `${n(selected.recordCount)} rows · validation failed` : 'No records available'} icon={MapPin} tone="icon-gold" /><Metric label="Total wards" value={selected?.valid ? n(selected.totalWards) : '—'} note="Sum of source ward counts" icon={Users} /><Metric label="Total voters" value={selected?.valid ? n(selected.state.registered) : '—'} note="Calculated from ULB records" icon={Users} /><Metric label="Votes polled" value={selected?.valid ? n(selected.state.polled) : '—'} note={selected?.valid ? `${n(selected.state.remaining)} remaining` : 'Unavailable until data validates'} icon={Vote} tone="icon-blue" /><Metric label="Overall polling" value={selected?.valid ? p(selected.state.pct) : '—'} note={`${snapshot} · weighted by total voters`} icon={Activity} tone="icon-teal" /></section>

      <section className="panel glass-panel comparison-panel"><div className="panel-heading"><div><div className="eyebrow">TIME-WISE COMPARISON</div><h2>Statewide polling progress</h2></div><span className="live-tag">Source worksheets</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}><CartesianGrid stroke="rgba(122,31,43,.1)" vertical={false} strokeDasharray="4 6" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8b756e', fontSize: 12 }} dy={10} /><YAxis unit="%" axisLine={false} tickLine={false} tick={{ fill: '#8b756e', fontSize: 11 }} width={48} /><Tooltip contentStyle={{ background: '#fffdf9', border: '1px solid rgba(122,31,43,.16)', borderRadius: 12 }} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Turnout']} /><Line type="monotone" dataKey="pct" connectNulls={false} stroke="#8a2635" strokeWidth={3} dot={{ r: 5, fill: '#e1b945', stroke: '#fffdf9', strokeWidth: 3 }} /></LineChart></ResponsiveContainer></div><div className="delta-grid"><div><small>11 AM → 1 PM</small><b>{pp(delta('11 AM', '1 PM'))}</b></div><div><small>1 PM → 3 PM</small><b>{pp(delta('1 PM', '3 PM'))}</b></div><div><small>3 PM → 5 PM</small><b>{pp(delta('3 PM', '5 PM'))}</b></div><div><small>11 AM → 5 PM</small><b>{pp(delta('11 AM', '5 PM'))}</b></div></div></section>

      <section className="panel glass-panel directory-panel"><div className="directory-heading"><div><div className="eyebrow">ULB-WISE COMPARISON</div><h2>Compare all reporting areas</h2><p>Percentage-point change uses 5 PM minus 11 AM.</p></div><span className="count-chip">{comparisons.length} of 92 ULBs</span></div><div className="directory-toolbar"><label className="search-box"><Search size={17} /><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search ULB or district…" aria-label="Search ULB or district" /></label><label className="select-control"><span>District</span><select value={districtFilter} onChange={e => { setDistrictFilter(e.target.value); setPage(1) }}><option>All districts</option>{districts.map(d => <option key={d}>{d}</option>)}</select></label><label className="select-control"><span>Sort by</span><select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}><option value="poll-high">Highest {snapshot} turnout</option><option value="poll-low">Lowest {snapshot} turnout</option><option value="increase-high">Highest increase</option><option value="increase-low">Lowest increase</option><option value="name">Name A–Z</option></select></label></div><div className="table-scroll"><table className="data-table comparison-table"><thead><tr><th>District</th><th>ULB</th><th>11 AM %</th><th>1 PM %</th><th>3 PM %</th><th>5 PM %</th><th>Total increase</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.district || '—'}</td><td className="district-name">{row.name}</td><td>{p(row.a)}</td><td>{p(row.b)}</td><td>{p(row.c)}</td><td>{p(row.d)}</td><td><b className="increase-value">{pp(row.increase)}</b></td></tr>)}{visible.length === 0 && <tr><td colSpan={7} className="empty-results">No records available for this search and filter.</td></tr>}</tbody></table></div><div className="directory-footer"><div className="page-size-control"><span>Rows</span><select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><span className="range-label">{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span></div><div className="pagination"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button><span>Page <b>{currentPage}</b> of {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</button></div></div></section>

      <section className="secondary-grid"><article className="panel glass-panel table-panel"><div className="panel-heading"><div><div className="eyebrow">DISTRICT PERFORMANCE</div><h2>Weighted turnout by district</h2></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>District</th><th>ULBs</th><th>11 AM</th><th>1 PM</th><th>3 PM</th><th>5 PM</th><th>Increase</th></tr></thead><tbody>{districtStats.map(d => <tr key={d.name}><td className="district-name">{d.name}</td><td>{n(d.count)}</td><td>{p(d.a)}</td><td>{p(d.b)}</td><td>{p(d.c)}</td><td>{p(d.d)}</td><td><b className="increase-value">{pp(d.increase)}</b></td></tr>)}</tbody></table></div></article><article className="panel glass-panel ranking-panel"><div className="panel-heading"><div><div className="eyebrow">SELECTED TIME · {snapshot}</div><h2>Top and bottom performers</h2></div></div><div className="rank-columns"><div><h3>Top 10 turnout</h3>{performers.slice(0, 10).map((row, i) => <div className="performer-row" key={row.key}><span>{String(i + 1).padStart(2, '0')}</span><b>{row.name}</b><strong>{p(row.pct)}</strong></div>)}</div><div><h3>Bottom 10 turnout</h3>{performers.slice(-10).reverse().map((row, i) => <div className="performer-row" key={row.key}><span>{String(i + 1).padStart(2, '0')}</span><b>{row.name}</b><strong>{p(row.pct)}</strong></div>)}</div><div><h3>Highest increase · {increaseLabel}</h3>{increaseRanks.slice(0, 10).map((row, i) => <div className="performer-row" key={row.id}><span>{String(i + 1).padStart(2, '0')}</span><b>{row.name}</b><strong>{pp(row.slotIncrease)}</strong></div>)}</div><div><h3>Lowest increase · {increaseLabel}</h3>{increaseRanks.slice(-10).reverse().map((row, i) => <div className="performer-row" key={row.id}><span>{String(i + 1).padStart(2, '0')}</span><b>{row.name}</b><strong>{pp(row.slotIncrease)}</strong></div>)}</div></div></article></section>

      <details className="panel glass-panel validation-panel"><summary>Data validation details · {allWarnings.length} issue(s)</summary><div>{reports.map((r: any) => <section key={r.snapshot}><h3>{r.snapshot}: {r.available ? `${r.recordCount} records${r.valid ? ' · valid' : ' · needs attention'}` : 'worksheet missing or empty'}</h3>{r.issues?.map((issue: any, i: number) => <p key={`${issue.code}-${i}`}>{issue.message}</p>)}</section>)}</div></details>
      <footer className="dashboard-footer"><span>ANDHRA PRADESH ELECTION COMMAND CENTRE</span><span>Last successful synchronization: {t(data.meta?.syncedAt)} · Source updated {t(data.meta?.sourceUpdatedAt && Date.parse(data.meta.sourceUpdatedAt))}</span></footer>
    </main>
  </div>
}
