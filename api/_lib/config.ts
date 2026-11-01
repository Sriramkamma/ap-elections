export type Field = 'district'|'ulb'|'ward'|'psNo'|'psName'|'registered'|'male'|'female'|'other'|'polled'|'sourcePct'|'reportedAt'|'snapshot'
export type Level = 'polling_station'|'ward'|'ulb_summary'|'roll_reference'

export interface TabConfig {
  tab: string
  level: Level
  headerRow?: number            // 1-based, default 1
  snapshot?: string             // fixed label e.g. "11 AM"; else read from a snapshot column
  columns?: Partial<Record<Field, string[]>>   // exact header overrides
}

// Auto-detected headers (matched after lowercasing and stripping symbols)
export const DEFAULT_ALIASES: Record<Field, string[]> = {
  district: ['district', 'districtname'],
  ulb: ['ulb', 'ulbname', 'municipality', 'corporation', 'urbanlocalbody'],
  ward: ['ward', 'wardno', 'wardnumber', 'wardname'],
  psNo: ['psno', 'psnumber', 'pollingstationno', 'pollingstationnumber', 'boothno', 'boothnumber'],
  psName: ['psname', 'pollingstationname', 'boothname', 'pollingstation'],
  registered: ['totalvoters', 'registeredvoters', 'electors', 'totalelectors', 'voters'],
  male: ['male', 'malevoters', 'maleelectors'],
  female: ['female', 'femalevoters', 'femaleelectors'],
  other: ['other', 'others', 'thirdgender', 'othervoters'],
  polled: ['votespolled', 'polled', 'totalpolled', 'votescast', 'votescasted'],
  sourcePct: ['pollingpercentage', 'pollingpercent', 'percentage', 'turnout', 'turnoutpercent'],
  reportedAt: ['reportedat', 'timestamp', 'reportingtime', 'updatedat'],
  snapshot: ['slot', 'reportingslot', 'period', 'reportingperiod', 'snapshot'],
}

// The live workbook currently provides one ULB-level summary tab.
export const TABS: TabConfig[] = [
  { tab: 'Sheet1', level: 'ulb_summary', snapshot: '1 PM' },
]

export const PCT_TOLERANCE = 0.5 // percentage points before a reconciliation warning
