// The app's API, used by both the Vite dev/preview server (server/vitePlugin.ts) and Vercel (server/vercel.ts).
// Browsers can't read MMS/CWA/GDACS directly (no CORS, http-only images), so the app talks to these routes.
//   GET  /api/status[?archive=belal]   warnings, rainfall, weather, cyclone position + tracks
//   GET  /api/water                     reservoirs (locations + levels) and CWA notices
//   GET  /api/mms/menu                  the MMS website menu, read live
//   GET  /api/mms/page?path=…           any page in that menu, as content blocks
//   GET  /api/mms/image?src=…           MMS images (satellite, charts, icons)
//   GET  /api/towns                     current weather for more towns (Open-Meteo model estimates)
//   GET  /api/news                      L'Express / Defimedia headlines and press-reported disruptions
//   GET  /api/reports[?scope=demo]  POST /api/reports   community reports shown on the map
//   DELETE /api/reports/<id>            remove a report (header x-admin-key = ADMIN_KEY env var)
//   GET  /api/reports/photo/<id>.jpg
//
// Cache-Control "s-maxage" lets Vercel's CDN serve the same answer to everyone for a few minutes,
// so the official sites aren't hit on every visit. Local dev ignores it.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { getMenu, getPage, isAllowedPath } from './mmsPages.ts'
import { getNews } from './news.ts'
import { ReportError, addReport, deleteReport, getPhoto, listReports } from './reports.ts'
import { getBelalArchiveStatus, getLiveStatus } from './status.ts'
import { getTowns } from './towns.ts'
import { getWater } from './water.ts'

const cdn = (seconds: number) => `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`

function json(res: ServerResponse, status: number, body: unknown, cache = 'no-store') {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', status === 200 ? cache : 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, limit = 1_500_000): Promise<unknown> {
  // Vercel may already have parsed the JSON body.
  const pre = (req as IncomingMessage & { body?: unknown }).body
  if (pre !== undefined) return typeof pre === 'string' ? JSON.parse(pre) : pre
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new ReportError('Request too large.', 413)
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const clientIp = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'

const ACTIVE_CYCLONE = /^class[1-4]$|^safetyBulletin$/

/** Handles /api/* requests. Returns false for anything else. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith('/api/')) return false
  const url = new URL(req.url, 'http://x')
  try {
    switch (url.pathname) {
      case '/api/status':
        if (url.searchParams.get('archive') === 'belal') return json(res, 200, getBelalArchiveStatus(), cdn(60)), true
        return json(res, 200, await getLiveStatus(), cdn(120)), true

      case '/api/towns':
        return json(res, 200, await getTowns(), cdn(900)), true

      case '/api/news':
        return json(res, 200, await getNews(), cdn(600)), true

      case '/api/water':
        return json(res, 200, await getWater(), cdn(3600)), true

      case '/api/mms/menu':
        return json(res, 200, await getMenu(), cdn(86400)), true

      case '/api/mms/page': {
        const path = url.searchParams.get('path') ?? ''
        if (!(await isAllowedPath(path))) return json(res, 404, { error: 'Not an MMS menu page.' }), true
        return json(res, 200, await getPage(path), cdn(300)), true
      }

      case '/api/mms/image': {
        const src = new URL(url.searchParams.get('src') ?? '')
        if (src.hostname !== 'metservice.intnet.mu') return json(res, 400, { error: 'Only MMS images.' }), true
        const upstream = await fetch(src, { signal: AbortSignal.timeout(20_000) })
        const type = upstream.headers.get('content-type') ?? ''
        if (!upstream.ok || !type.startsWith('image/')) return json(res, 502, { error: 'Image unavailable.' }), true
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', cdn(600))
        res.end(Buffer.from(await upstream.arrayBuffer()))
        return true
      }

      case '/api/reports': {
        if (req.method === 'GET') return json(res, 200, await listReports(url.searchParams.get('scope') === 'demo' ? 'demo' : 'live'), cdn(30)), true
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' }), true
        const body = (await readBody(req)) as Record<string, unknown>
        // Reporting opens with a cyclone warning. Demo/archive modes let people try it without one.
        const status = await getLiveStatus()
        const demo = body.demo === true
        if (!demo && !ACTIVE_CYCLONE.test(status.snapshot.cyclone))
          return json(res, 403, { error: 'Reporting opens when a cyclone warning is in force.' }), true
        const warning = demo ? `demo:${String(body.demoWarning ?? '')}` : status.snapshot.cyclone
        return json(res, 201, await addReport(body, clientIp(req), warning)), true
      }
    }
    const del = url.pathname.match(/^\/api\/reports\/([0-9a-f-]{36})$/)
    if (del && req.method === 'DELETE') {
      const key = process.env.ADMIN_KEY
      if (!key) return json(res, 403, { error: 'Deleting is off: set ADMIN_KEY in the server settings.' }), true
      if (req.headers['x-admin-key'] !== key) return json(res, 401, { error: 'Wrong admin key.' }), true
      return json(res, (await deleteReport(del[1])) ? 200 : 404, { ok: true }), true
    }
    if (url.pathname.startsWith('/api/reports/photo/')) {
      const photo = await getPhoto(url.pathname.split('/').pop() ?? '')
      if (!photo) return json(res, 404, { error: 'Not found.' }), true
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      res.end(photo)
      return true
    }
    return json(res, 404, { error: 'Unknown API route.' }), true
  } catch (e) {
    const status = e instanceof ReportError ? e.status : 502
    return json(res, status, { error: (e as Error).message }), true
  }
}
