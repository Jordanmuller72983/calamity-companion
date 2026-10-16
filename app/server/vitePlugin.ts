import type { Connect, Plugin } from 'vite'
import { handleApi } from './api.ts'

/** Serves /api/* from the Vite dev and preview servers. On Vercel the same handler runs as a function (server/vercel.ts). */
export function liveDataApi(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    void handleApi(req, res).then((handled) => {
      if (!handled) next()
    })
  }
  return {
    name: 'calamity-live-data',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}
