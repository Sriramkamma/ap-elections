import { Redis } from '@upstash/redis'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import type { Rec, Issue } from './process.js'

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null
const pack = (r: Rec[]) => zlib.gzipSync(JSON.stringify(r)).toString('base64')
const unpack = (s: string): Rec[] => JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString())

export async function persistAndMerge(live: Rec[], issues: Issue[]): Promise<Rec[]> {
  if (!redis) { issues.push({ severity: 'info', code: 'NO_STORE', message: 'Snapshot persistence not configured (Upstash Redis)' }); return live }
  const byId = new Map<string, Rec[]>()
  live.filter(r => r.level !== 'roll_reference').forEach(r => {
    const id = `${r.tab}::${r.snapshot}`; (byId.get(id) ?? byId.set(id, []).get(id)!).push(r)
  })
  const keys = await redis.keys('snap:*')
  const stored = keys.length ? await redis.mget<({ hash: string; data: string } | null)[]>(...keys) : []
  const storedMap = new Map(keys.map((key, i) => [key.slice(5), stored[i]]))
  const out = [...live]
  for (const [id, rows] of byId) {
    const hash = crypto.createHash('sha1').update(JSON.stringify(rows.map(r => [r.ulb, r.ward, r.psNo, r.polled, r.sourcePct]))).digest('hex')
    const prev = storedMap.get(id)
    if (!prev) await redis.set(`snap:${id}`, { hash, data: pack(rows) }, { nx: true })
    else if (prev.hash !== hash) issues.push({ severity: 'warn', code: 'SNAPSHOT_EDITED', message: `Sheet data for "${id}" changed since first import; frozen copy retained` })
  }
  for (const [id, prev] of storedMap) {
    if (prev && !byId.has(id)) {
      out.push(...unpack(prev.data))
      issues.push({ severity: 'info', code: 'SNAPSHOT_RESTORED', message: `"${id}" no longer in sheet; restored from stored copy` })
    }
  }
  return out
}
