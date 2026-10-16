// Vercel function entry. Bundled by `npm run build:api` into api/index.mjs.
// vercel.json rewrites /api/<anything> to /api/index?__path=<anything>, so we restore the original path here.
// (The capture is named "route", not "path": Vercel also adds it to the query, and the app uses ?path= itself.)

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApi } from './api.ts'

export const config = { maxDuration: 60 }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const path = url.searchParams.get('__path')
  if (path !== null) {
    url.searchParams.delete('__path')
    url.searchParams.delete('route')
    req.url = `/api/${path}${url.search}`
  }
  const handled = await handleApi(req, res)
  if (!handled) {
    res.statusCode = 404
    res.end('Not found')
  }
}
