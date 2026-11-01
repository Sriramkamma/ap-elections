import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/data')) {
          return next()
        }
        try {
          const url = new URL(req.url, 'http://localhost')
          const query = Object.fromEntries(url.searchParams.entries())
          ;(req as any).query = query

          const response = res as any
          response.status = function (code: number) {
            res.statusCode = code
            return response
          }
          response.json = function (data: any) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
            return response
          }

          const mod = await server.ssrLoadModule('/api/data.ts')
          await mod.default(req, res)
        } catch (err: any) {
          console.error('API middleware error:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Sync failed', detail: err.message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // The local API middleware reads credentials from process.env. Vite loads
  // .env.local for client transforms, but does not populate process.env itself.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), tailwindcss(), apiDevPlugin()],
  }
})
