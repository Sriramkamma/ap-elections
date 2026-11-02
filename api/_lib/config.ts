export type Field = 'district'|'ulb'|'ward'|'wardCount'|'psNo'|'psName'|'registered'|'male'|'female'|'other'|'polled'|'sourcePct'|'reportedAt'|'snapshot'
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
  wardCount: ['noofwards', 'wardcount', 'totalwards'],
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

// Each reporting slot is a separate ULB summary worksheet in the live workbook.
export const TABS: TabConfig[] = [
  { tab: '11 am', level: 'ulb_summary', snapshot: '11 AM' },
  { tab: '1 pm', level: 'ulb_summary', snapshot: '1 PM' },
  { tab: '3 pm', level: 'ulb_summary', snapshot: '3 PM' },
  { tab: '5 pm', level: 'ulb_summary', snapshot: '5 PM' },
  { tab: '10 pm', level: 'ulb_summary', snapshot: '10 PM' },
]

export const EXPECTED_ULB_COUNT = 92
export const PCT_TOLERANCE = 0.011 // allow two-decimal source rounding only
