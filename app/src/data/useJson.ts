import { useCallback, useEffect, useState } from 'react'

/** GET a JSON API route, optionally refreshing on an interval and when the window regains focus. */
export function useJson<T>(url: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(!!url)

  const load = useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? String(res.status))
      setData(body as T)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    const first = setTimeout(load, 0)
    const id = refreshMs ? setInterval(load, refreshMs) : undefined
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(first)
      if (id) clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [url, refreshMs, load])

  return { data, error, loading, reload: load }
}
