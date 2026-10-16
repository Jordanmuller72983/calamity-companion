import { useCallback, useEffect, useState } from 'react'
import type { LiveStatus } from './liveTypes'

const REFRESH_MS = 5 * 60 * 1000
const STORAGE_KEY = 'cc.lastLive'

function readCached(): LiveStatus | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LiveStatus) : undefined
  } catch {
    return undefined
  }
}

function writeCached(s: LiveStatus) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // offline cache is a convenience only
  }
}

/** Live MMS status from /api/status. Refreshes every 5 min, on focus and when back online. */
export function useLiveStatus(source: 'live' | 'belal') {
  const [data, setData] = useState<LiveStatus | undefined>(() => (source === 'live' ? readCached() : undefined))
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(source === 'belal' ? '/api/status?archive=belal' : '/api/status')
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as LiveStatus
      setData(json)
      setError(json.errors.length > 0 && !json.rainfall.last3h)
      if (source === 'live') writeCached(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const id = setInterval(load, REFRESH_MS)
    const onWake = () => void load()
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [load])

  return { data, error, loading, reload: load }
}
