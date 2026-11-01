import { useCallback, useEffect, useState } from 'react'

export function useData(ulb?: string) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (manual = false) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (ulb) q.set('ulb', ulb)
      if (manual) q.set('refresh', '1')
      const r = await fetch(`/api/data?${q}`, { headers: { 'x-access-key': sessionStorage.getItem('key') ?? '' } })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText)
      setData(await r.json()); setError(null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [ulb])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), (Number(import.meta.env.VITE_REFRESH_SECONDS) || 120) * 1000)
    return () => clearInterval(t)
  }, [load])

  return { data, error, loading, reload: () => load(true) }
}
