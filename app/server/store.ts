// Small key/value store: Upstash Redis when deployed (Vercel → Storage → Upstash), a local folder in development.
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN (older setups: UPSTASH_REDIS_REST_*).

import { Redis } from '@upstash/redis'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : undefined

export const storeKind = redis ? 'redis' : 'file'
export const isServerless = !!process.env.VERCEL

const DIR = join(process.cwd(), 'server', 'data')
const file = (key: string) => join(DIR, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`)

export async function getJson<T>(key: string): Promise<T | undefined> {
  if (redis) return ((await redis.get<T>(key)) ?? undefined) as T | undefined
  if (isServerless) return undefined
  try {
    return JSON.parse(readFileSync(file(key), 'utf8')) as T
  } catch {
    return undefined
  }
}

/** ttlSeconds: expiry (Redis only; local files are kept). */
export async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (redis) {
    await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value))
    return
  }
  if (isServerless) throw new Error('No storage configured: add Upstash Redis to this Vercel project.')
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
  writeFileSync(file(key), JSON.stringify(value))
}

export async function del(key: string): Promise<void> {
  if (redis) {
    await redis.del(key)
    return
  }
  if (isServerless) return
  try {
    const { rmSync } = await import('node:fs')
    rmSync(file(key), { force: true })
  } catch {
    // nothing to delete
  }
}

/** Count hits for a key within a window (rate limiting). */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  if (redis) {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, windowSeconds)
    return n
  }
  const now = Date.now()
  const hits = ((memoryHits.get(key) ?? []) as number[]).filter((t) => now - t < windowSeconds * 1000)
  hits.push(now)
  memoryHits.set(key, hits)
  return hits.length
}
const memoryHits = new Map<string, number[]>()
