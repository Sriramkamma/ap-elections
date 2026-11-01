import { Activity, AlertTriangle, ChevronLeft, ChevronRight, Clock3, MapPin, RefreshCw, Search, Users, Vote, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useState, type CSSProperties } from 'react'
import { useData } from '../hooks/useData'

const n = (x?: number | null) => x == null ? '—' : x.toLocaleString('en-IN')
const p = (x?: number | null) => x == null ? '—' : `${x.toFixed(2)}%`
const t = (x?: number | null) => x ? new Date(x).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '—'

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Users; tone?: string }) {
  return <article className="metric glass-panel">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone ?? ''}`}><Icon size={17} /></span></div>
    <strong>{value}</strong><small>{note}</small>
  </article>
}

export default function Command() {
  const { data, error, loading, reload } = useData()
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<'All' | 'District' | 'ULB'>('All')
  const [turnoutFilter, setTurnoutFilter] = useState('all')
  const [sortBy, setSortBy] = useState('turnout-high')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  if (!data) return <div className="loading-screen"><div className="loading-mark"><Activity /></div><p>{error ? `Unable to load dashboard: ${error}` : 'Connecting to live election data…'}</p></div>

  const { state, districts, ulbs, timeline, meta, issueCount } = data
  const directory = [
    ...districts.map((d: any) => ({ ...d, type: 'District', district: d.name })),
    ...ulbs.map((u: any) => ({ ...u, type: 'ULB', district: u.district || '' })),
  ]
  const query = search.trim().toLocaleLowerCase()
  const matchingRows = directory.filter((row: any) => {
    if (entityFilter !== 'All' && row.type !== entityFilter) return false
    if (turnoutFilter === 'above' && (row.pct ?? -1) < (state.pct ?? 0)) return false
    if (turnoutFilter === 'below' && (row.pct ?? Infinity) >= (state.pct ?? 0)) return false
    return !query || `${row.name} ${row.district} ${row.type}`.toLocaleLowerCase().includes(query)
  })
  matchingRows.sort((a: any, b: any) => {
    if (sortBy === 'turnout-low') return (a.pct ?? -1) - (b.pct ?? -1)
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'voters') return (b.registered ?? 0) - (a.registered ?? 0)
    return (b.pct ?? -1) - (a.pct ?? -1)
  })
  const totalPages = Math.max(1, Math.ceil(matchingRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = matchingRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rowCounts = { All: directory.length, District: districts.length, ULB: ulbs.length }
  const stale = Date.now() - meta.syncedAt > 5 * 60_000
  const progress = Math.max(0, Math.min(100, state.pct ?? 0))

  return <div className="dashboard-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar glass-panel">
      <a className="brand" href="#top" aria-label="AP Election Command Centre home"><span className="brand-seal">AP</span><span><b>AP Election</b><small>COMMAND CENTRE <i>2026</i></small></span></a>
      <div className="topbar-right">
        <div className={`live-status ${error || stale ? 'status-warn' : ''}`}><span className="status-dot" />{error ? 'Sync issue' : stale ? 'Data may be stale' : 'Live data'}</div>
        <div className="sync-meta"><span>Last sync</span><b>{t(meta.syncedAt)}</b></div>
        <button className="refresh-button" onClick={reload} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /><span>{loading ? 'Syncing' : 'Refresh'}</span></button>
      </div>
    </header>

    <main id="top" className="dashboard-content">
      <section className="page-heading">
        <div><div className="eyebrow"><MapPin size={13} /> ANDHRA PRADESH · LIVE OVERVIEW</div><h1>Election pulse</h1><p>Statewide turnout and reporting progress at a glance.</p></div>
        <div className="snapshot-pill"><span className="snapshot-dot" /><span><small>REPORTING SNAPSHOT</small><b>{meta.snapshot}</b></span><span className="snapshot-divider" /><span><small>ULBs REPORTING</small><b>{meta.reportingUlbs}<em> / {meta.totalUlbs}</em></b></span></div>
      </section>

      {issueCount > 0 && <div className="quality-alert"><AlertTriangle size={17} /><span><b>{issueCount} data quality {issueCount === 1 ? 'notice' : 'notices'}</b><small>{state.incomplete} row(s) excluded for missing voter or polling totals.</small></span></div>}

      <section className="metrics-grid">
        <Metric label="Polling percentage" value={p(state.pct)} note="Statewide turnout" icon={Activity} tone="icon-teal" />
        <Metric label="Registered voters" value={n(state.registered)} note="Electors on the roll" icon={Users} />
        <Metric label="Votes polled" value={n(state.polled)} note="Votes recorded so far" icon={Vote} tone="icon-blue" />
        <Metric label="Remaining" value={n(state.remaining)} note="Yet to be polled" icon={Clock3} tone="icon-gold" />
      </section>

      <section className="primary-grid">
        <article className="panel glass-panel turnout-panel">
          <div className="panel-heading"><div><div className="eyebrow">TURNOUT TREND</div><h2>Statewide polling progress</h2></div><span className="live-tag"><span className="status-dot" /> {meta.snapshot}</span></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(122,31,43,.1)" vertical={false} strokeDasharray="4 6" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8b756e', fontSize: 12 }} dy={10} />
            <YAxis unit="%" axisLine={false} tickLine={false} tick={{ fill: '#8b756e', fontSize: 11 }} width={42} />
            <Tooltip contentStyle={{ background: '#fffdf9', border: '1px solid rgba(122,31,43,.16)', borderRadius: 12, color: '#3b2527', boxShadow: '0 12px 30px rgba(62,35,28,.12)' }} labelStyle={{ color: '#8b756e' }} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Turnout']} />
            <Line type="monotone" dataKey="pct" stroke="#8a2635" strokeWidth={3} dot={{ r: 4, fill: '#e1b945', stroke: '#fffdf9', strokeWidth: 3 }} activeDot={{ r: 6, fill: '#e1b945', stroke: '#8a2635', strokeWidth: 2 }} />
          </LineChart></ResponsiveContainer></div>
          <div className="chart-footnote"><span><i className="legend-line" /> Turnout across reporting snapshots</span><span>Source: Google Sheets</span></div>
        </article>

        <article className="panel glass-panel progress-panel">
          <div className="panel-heading"><div><div className="eyebrow">STATEWIDE STATUS</div><h2>Polling completion</h2></div></div>
          <div className="progress-content"><div className="progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><div className="ring-center"><strong>{p(state.pct)}</strong><small>TURNOUT</small></div></div>
            <div className="progress-copy"><span className="progress-label">Current participation</span><p><b>{n(state.polled)}</b> <span>of {n(state.registered)} electors</span></p><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><small>{n(state.remaining)} voters remaining</small></div>
          </div>
          <div className="progress-divider" /><div className="reporting-foot"><span><span className="status-dot" /> Reporting now</span><b>{meta.reportingUlbs} of {meta.totalUlbs} ULBs</b></div>
        </article>
      </section>

      <section className="panel glass-panel directory-panel">
        <div className="directory-heading"><div><div className="eyebrow">GEOGRAPHIC BREAKDOWN</div><h2>Find a district or ULB</h2><p>Search, filter and compare every reporting area.</p></div><span className="count-chip">{matchingRows.length.toLocaleString('en-IN')} results</span></div>
        <div className="directory-toolbar">
          <label className="search-box"><Search size={17} /><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search by district, ULB or name…" aria-label="Search districts and ULBs" />{search && <button className="clear-search" onClick={() => { setSearch(''); setPage(1) }} aria-label="Clear search"><X size={15} /></button>}</label>
          <label className="select-control"><span>Turnout</span><select value={turnoutFilter} onChange={e => { setTurnoutFilter(e.target.value); setPage(1) }}><option value="all">Any turnout</option><option value="above">Above state average</option><option value="below">Below state average</option></select></label>
          <label className="select-control"><span>Sort by</span><select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}><option value="turnout-high">Highest turnout</option><option value="turnout-low">Lowest turnout</option><option value="name">Name A–Z</option><option value="voters">Most voters</option></select></label>
        </div>
        <div className="directory-tabs" role="tablist" aria-label="Choose area type">{(['All', 'District', 'ULB'] as const).map((filter, index) => <button key={filter} role="tab" aria-selected={entityFilter === filter} className={entityFilter === filter ? 'directory-tab active' : 'directory-tab'} onClick={() => { setEntityFilter(filter); setPage(1) }}>{index === 1 ? 'Districts' : index === 2 ? 'ULBs' : filter}<span>{rowCounts[filter]}</span></button>)}</div>
        <div className="table-scroll directory-table-scroll"><table className="data-table directory-table"><thead><tr><th>Area</th><th>Type</th><th>District</th><th>Registered voters</th><th>Votes polled</th><th>Remaining</th><th>Turnout</th></tr></thead><tbody>
          {visibleRows.map((row: any) => <tr key={`${row.type}-${row.key}`}><td className="district-name">{row.name}</td><td><span className={`entity-badge ${row.type === 'ULB' ? 'ulb-badge' : ''}`}>{row.type}</span></td><td>{row.type === 'District' ? '—' : row.district || '—'}</td><td>{n(row.registered)}</td><td>{n(row.polled)}</td><td>{n(row.remaining)}</td><td><span className="turnout-cell"><span className="mini-track"><i style={{ width: `${Math.min(100, row.pct ?? 0)}%` }} /></span><b>{p(row.pct)}</b></span></td></tr>)}
          {visibleRows.length === 0 && <tr><td colSpan={7} className="empty-results"><Search size={20} /><b>No matching areas found</b><span>Try a different name or clear one of the filters.</span></td></tr>}
        </tbody></table></div>
        <div className="directory-footer"><div className="page-size-control"><span>Rows per page</span><select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }} aria-label="Rows per page"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select><span className="range-label">{matchingRows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, matchingRows.length)} of ${matchingRows.length}` : '0 results'}</span></div><div className="pagination"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>Page <b>{currentPage}</b> of {totalPages}</span><button aria-label="Next page" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
      </section>
      <footer className="dashboard-footer"><span>ANDHRA PRADESH ELECTION COMMAND CENTRE</span><span>Data refreshes automatically · Source updated {t(meta.sourceUpdatedAt && Date.parse(meta.sourceUpdatedAt))}</span></footer>
    </main>
  </div>
}
